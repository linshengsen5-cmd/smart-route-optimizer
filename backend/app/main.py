from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from app.optimizer import optimize_itinerary, geocode_address

app = FastAPI(title="Smart Route Optimizer API")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex="https://.*",  # すべてのHTTPSサイトからの接続を許可
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "FastAPI is running!"}

class SpotItem(BaseModel):
    name: str
    stay_minutes: int = 45
    buffer_minutes: Optional[int] = 0  # ★ 自由設定バッファ
    priority: int = 3
    lat: float = 35.0
    lng: float = 135.7
    is_start: Optional[bool] = False
    is_end: Optional[bool] = False

class OptimizeRequest(BaseModel):
    spots: List[SpotItem]
    start_time: str
    deadline_time: str
    travel_mode: str = "DRIVE"

@app.post("/api/optimize")
def run_optimization(request: OptimizeRequest):
    spots_data = [spot.model_dump() for spot in request.spots]
    result = optimize_itinerary(
        spots=spots_data,
        start_time_str=request.start_time,
        deadline_time_str=request.deadline_time,
        travel_mode=request.travel_mode
    )
    return result

@app.get("/api/geocode")
def get_coordinates(query: str):
    coords = geocode_address(query)
    if not coords:
        raise HTTPException(status_code=404, detail="場所が見つかりませんでした")
    return coords