import os
import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
from supabase import create_client, Client
from dotenv import load_dotenv

from dotenv import load_dotenv
import os

# 1. Force dotenv to override any cached variables
load_dotenv(override=True)

# 2. Remove the fallback strings so it crashes immediately if empty, rather than sending fake keys
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# 3. TEMPORARY DEBUG: Print the loaded values to your terminal
print("----- DEBUG START -----")
print(f"URL Loaded: {SUPABASE_URL}")
print(f"KEY Loaded: {str(SUPABASE_KEY)[:15]}... (truncated for security)")
print("----- DEBUG END -----")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

load_dotenv()

app = FastAPI(title="MetalErosion API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Supabase Client
SUPABASE_URL = os.getenv("SUPABASE_URL", "YOUR_SUPABASE_PROJECT_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "YOUR_SUPABASE_SERVICE_OR_ANON_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

model = YOLO("models/best.pt")

LOWER_RUST1 = np.array([0, 40, 30])
UPPER_RUST1 = np.array([25, 255, 200])
LOWER_RUST2 = np.array([170, 40, 30])
UPPER_RUST2 = np.array([180, 255, 200])
PADDING = 30

def calculate_astm_grade(percentage: float):
    """
    Standard ASTM D610 rust grading scale and maintenance priority mapping.
    """
    if percentage <= 0.01:
        return 10, "Low", "No action needed. Continue routine monitoring."
    elif percentage <= 0.03:
        return 9, "Low", "Minor surface blemishes. Routine inspection."
    elif percentage <= 0.1:
        return 8, "Low", "Spot rusting beginning. Monitor progression."
    elif percentage <= 0.3:
        return 7, "Moderate", "Localized surface corrosion. Schedule cleaning."
    elif percentage <= 1.0:
        return 6, "Moderate", "Active corrosion forming. Preventive recoating advised."
    elif percentage <= 3.0:
        return 5, "Moderate", "Significant localized rusting. Surface maintenance needed."
    elif percentage <= 10.0:
        return 4, "High", "Widespread rust patches. Corrective maintenance required."
    elif percentage <= 16.0:
        return 3, "High", "Substantial coating failure. Remedial treatment needed."
    elif percentage <= 33.0:
        return 2, "Critical", "Severe degradation. Immediate recoating and repair."
    elif percentage <= 50.0:
        return 1, "Critical", "Extensive structural oxidation. Urgent intervention required."
    else:
        return 0, "Critical", "Total structural failure. Complete replacement advised."

@app.post("/analyze-corrosion")
async def analyze_corrosion(
    file: UploadFile = File(...),
    user_id: str = Form(None)  # Received from frontend auth state
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")

    try:
        # 1. Read & process image
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        h, w, _ = image.shape
        total_image_pixels = h * w

        # 2. YOLO Detection
        results = model.predict(source=image, conf=0.20, iou=0.45)
        boxes = results[0].boxes.xyxy.cpu().numpy().astype(int)

        # 3. OpenCV Masking with Padding
        rust_mask = np.zeros((h, w), dtype=np.uint8)
        for x1, y1, x2, y2 in boxes:
            pad_x1, pad_y1 = max(0, x1 - PADDING), max(0, y1 - PADDING)
            pad_x2, pad_y2 = min(w, x2 + PADDING), min(h, y2 + PADDING)

            roi = image[pad_y1:pad_y2, pad_x1:pad_x2]
            hsv_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)

            mask1 = cv2.inRange(hsv_roi, LOWER_RUST1, UPPER_RUST1)
            mask2 = cv2.inRange(hsv_roi, LOWER_RUST2, UPPER_RUST2)
            roi_mask = cv2.bitwise_or(mask1, mask2)
            
            rust_mask[pad_y1:pad_y2, pad_x1:pad_x2] = cv2.bitwise_or(
                rust_mask[pad_y1:pad_y2, pad_x1:pad_x2], roi_mask
            )

        # 4. Metric Calculations
        total_rust_pixels = cv2.countNonZero(rust_mask)
        rust_percentage = round((total_rust_pixels / total_image_pixels) * 100, 2)
        flat_boxes = boxes.flatten().tolist()
        
        astm_grade, priority, recommendation = calculate_astm_grade(rust_percentage)

        # 5. Save Record to Supabase (if user_id is provided)
        db_record_id = None
        if user_id:
            db_payload = {
                "user_id": user_id,
                "image_url": file.filename,  # Or your Supabase Storage URL
                "rust_percentage": rust_percentage,
                "box_coordinates": flat_boxes
            }
            res = supabase.table("scans").insert(db_payload).execute()
            if res.data:
                db_record_id = res.data[0]["id"]

        return {
            "status": "success",
            "filename": file.filename,
            "rust_percentage": rust_percentage,
            "astm_grade": astm_grade,
            "priority_level": priority,
            "recommendation": recommendation,
            "box_coordinates": flat_boxes,
            "scan_id": db_record_id
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)