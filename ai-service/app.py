from fastapi import FastAPI
from pydantic import BaseModel
import base64
import cv2
import numpy as np

app = FastAPI()

class FrameInput(BaseModel):
    image: str
    mask: str

@app.post("/run")
async def run_inpaint(data: FrameInput):

    image_bytes = base64.b64decode(data.image)
    mask_bytes = base64.b64decode(data.mask)

    image = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    mask = cv2.imdecode(np.frombuffer(mask_bytes, np.uint8), cv2.IMREAD_GRAYSCALE)

    result = cv2.inpaint(image, mask, 3, cv2.INPAINT_TELEA)

    _, buffer = cv2.imencode(".png", result)
    output = base64.b64encode(buffer).decode("utf-8")

    return {"output": output}
