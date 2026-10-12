import os
import itertools
import requests
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")

# 走行情報キャッシュ
TRAVEL_CACHE: Dict[tuple, tuple[int, float, str]] = {}

def geocode_address(query: str) -> Optional[Dict[str, float]]:
    url = "https://nominatim.openstreetmap.org/search"
    headers = {"User-Agent": "SmartRouteOptimizer/1.0"}
    params = {"q": query, "format": "json", "limit": 1}
    try:
        res = requests.get(url, params=params, headers=headers, timeout=5)
        data = res.json()
        if data and len(data) > 0:
            return {
                "lat": float(data[0]["lat"]),
                "lng": float(data[0]["lon"])
            }
    except Exception as e:
        print(f"Geocoding エラー: {e}")
    return None

def fetch_real_travel_info(lat1: float, lng1: float, lat2: float, lng2: float, travel_mode: str = "DRIVE") -> tuple[int, float, str]:
    if not GOOGLE_MAPS_API_KEY:
        return 15, 3.0, ""

    url = "https://routes.googleapis.com/directions/v2:computeRoutes"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline"
    }

    body = {
        "origin": {"location": {"latLng": {"latitude": lat1, "longitude": lng1}}},
        "destination": {"location": {"latLng": {"latitude": lat2, "longitude": lng2}}},
        "travelMode": travel_mode,
        "routingPreference": "TRAFFIC_AWARE" if travel_mode == "DRIVE" else "ROUTING_PREFERENCE_UNSPECIFIED",
        "languageCode": "ja"
    }

    try:
        response = requests.post(url, json=body, headers=headers, timeout=8)
        data = response.json()
        if "routes" in data and len(data["routes"]) > 0:
            route = data["routes"][0]
            duration_str = route.get("duration", "0s").replace("s", "")
            duration_sec = int(duration_str)
            distance_meters = route.get("distanceMeters", 0)
            polyline_str = route.get("polyline", {}).get("encodedPolyline", "")

            travel_min = max(1, int(round(duration_sec / 60)))
            dist_km = round(distance_meters / 1000.0, 2)
            return travel_min, dist_km, polyline_str
    except Exception as e:
        print(f"Routes API 通信エラー: {e}")

    return 15, 3.0, ""

def get_cached_travel_info(s1: Dict[str, Any], s2: Dict[str, Any], travel_mode: str) -> tuple[int, float, str]:
    key = (round(s1["lat"], 5), round(s1["lng"], 5), round(s2["lat"], 5), round(s2["lng"], 5), travel_mode)
    if key not in TRAVEL_CACHE:
        TRAVEL_CACHE[key] = fetch_real_travel_info(
            s1["lat"], s1["lng"], s2["lat"], s2["lng"], travel_mode=travel_mode
        )
    return TRAVEL_CACHE[key]

def preload_all_travel_pairs(spots: List[Dict[str, Any]], travel_mode: str):
    for i, s1 in enumerate(spots):
        for j, s2 in enumerate(spots):
            if i != j:
                get_cached_travel_info(s1, s2, travel_mode)

def parse_time(time_str: str) -> datetime:
    today = datetime.today()
    h, m = map(int, time_str.split(":"))
    return datetime(today.year, today.month, today.day, h, m)

def calculate_schedule(
    ordered_spots: List[Dict[str, Any]],
    start_dt: datetime,
    travel_mode: str = "DRIVE"
) -> List[Dict[str, Any]]:
    schedule = []
    current_time = start_dt

    for i, spot in enumerate(ordered_spots):
        if i > 0:
            prev_spot = ordered_spots[i-1]
            travel_min, dist_km, polyline_str = get_cached_travel_info(prev_spot, spot, travel_mode)

            travel_start = current_time
            current_time += timedelta(minutes=travel_min)
            schedule.append({
                "type": "travel",
                "duration_min": travel_min,
                "distance_km": dist_km,
                "polyline": polyline_str,
                "start_time": travel_start.strftime("%H:%M"),
                "end_time": current_time.strftime("%H:%M"),
                "description": f"{prev_spot['name']} から {spot['name']} へ移動 ({dist_km}km)"
            })

        arrive_time = current_time
        stay_min = spot.get("stay_minutes", 30)
        buffer_min = spot.get("buffer_minutes", 0)  # ★ バッファ時間を加算
        total_spot_time = stay_min + buffer_min

        current_time += timedelta(minutes=total_spot_time)
        schedule.append({
            "type": "spot",
            "name": spot["name"],
            "lat": spot["lat"],
            "lng": spot["lng"],
            "priority": spot.get("priority", 1),
            "stay_minutes": stay_min,
            "buffer_minutes": buffer_min,
            "arrive_time": arrive_time.strftime("%H:%M"),
            "leave_time": current_time.strftime("%H:%M"),
        })

    return schedule

def solve_with_2opt(spots: List[Dict[str, Any]], travel_mode: str) -> List[Dict[str, Any]]:
    if len(spots) <= 2:
        return spots

    unvisited = spots[1:]
    current = spots[0]
    route = [current]

    while unvisited:
        next_spot = min(
            unvisited,
            key=lambda s: get_cached_travel_info(current, s, travel_mode)[0]
        )
        route.append(next_spot)
        unvisited.remove(next_spot)
        current = next_spot

    improved = True
    iterations = 0
    max_iterations = 50

    while improved and iterations < max_iterations:
        improved = False
        iterations += 1
        for i in range(len(route) - 2):
            for j in range(i + 2, len(route)):
                cost_current = (
                    get_cached_travel_info(route[i], route[i+1], travel_mode)[0] +
                    (get_cached_travel_info(route[j], route[j+1], travel_mode)[0] if j+1 < len(route) else 0)
                )
                cost_reversed = (
                    get_cached_travel_info(route[i], route[j], travel_mode)[0] +
                    (get_cached_travel_info(route[i+1], route[j+1], travel_mode)[0] if j+1 < len(route) else 0)
                )
                if cost_reversed < cost_current:
                    route[i+1:j+1] = reversed(route[i+1:j+1])
                    improved = True
                    break
            if improved:
                break

    return route

def optimize_itinerary(
    spots: List[Dict[str, Any]],
    start_time_str: str,
    deadline_time_str: str,
    travel_mode: str = "DRIVE"
) -> Dict[str, Any]:
    start_dt = parse_time(start_time_str)
    deadline_dt = parse_time(deadline_time_str)
    available_total_minutes = (deadline_dt - start_dt).total_seconds() / 60

    if available_total_minutes <= 0:
        return {"success": False, "message": "終了時間は開始時間より後に設定してください。"}

    preload_all_travel_pairs(spots, travel_mode)

    def find_best_route(target_spots: List[Dict[str, Any]]) -> Optional[List[Dict[str, Any]]]:
        if not target_spots:
            return None

        start_spot = next((s for s in target_spots if s.get("is_start")), None)
        end_spot = next((s for s in target_spots if s.get("is_end")), None)
        middles = [s for s in target_spots if s != start_spot and s != end_spot]

        best_sched = None
        min_travel = float("inf")

        if len(middles) <= 7:
            for perm in itertools.permutations(middles):
                order = []
                if start_spot:
                    order.append(start_spot)
                order.extend(perm)
                if end_spot:
                    order.append(end_spot)

                sched = calculate_schedule(order, start_dt, travel_mode=travel_mode)
                if sched and parse_time(sched[-1]["leave_time"]) <= deadline_dt:
                    total_t = sum(item["duration_min"] for item in sched if item["type"] == "travel")
                    if total_t < min_travel:
                        min_travel = total_t
                        best_sched = sched
        else:
            optimized_middles = solve_with_2opt(middles, travel_mode=travel_mode)
            order = []
            if start_spot:
                order.append(start_spot)
            order.extend(optimized_middles)
            if end_spot:
                order.append(end_spot)

            sched = calculate_schedule(order, start_dt, travel_mode=travel_mode)
            if sched and parse_time(sched[-1]["leave_time"]) <= deadline_dt:
                best_sched = sched

        return best_sched

    selected_spots = spots.copy()
    best_schedule = find_best_route(selected_spots)

    skipped_spots = []
    if not best_schedule:
        droppable_spots = sorted(
            [s for s in selected_spots if not s.get("is_start") and not s.get("is_end")],
            key=lambda x: x.get("priority", 1)
        )

        for dropped in droppable_spots:
            skipped_spots.append(dropped["name"])
            selected_spots.remove(dropped)
            best_schedule = find_best_route(selected_spots)
            if best_schedule:
                break

    if not best_schedule:
        return {
            "success": False,
            "message": "制限時間を超過しています。スポットを減らすか制限時間を延ばしてください。",
            "skipped_spots": skipped_spots
        }

    last_leave = best_schedule[-1]["leave_time"]
    spare_minutes = int((deadline_dt - parse_time(last_leave)).total_seconds() / 60)

    spot_items = [s for s in best_schedule if s["type"] == "spot"]
    google_maps_url = ""
    if len(spot_items) >= 2:
        path_segments = [f"{s['lat']},{s['lng']}" for s in spot_items]
        google_maps_url = f"https://www.google.com/maps/dir/{'/'.join(path_segments)}"

    return {
        "success": True,
        "start_time": start_time_str,
        "deadline_time": deadline_time_str,
        "final_end_time": last_leave,
        "spare_time_minutes": spare_minutes,
        "skipped_spots": skipped_spots,
        "google_maps_url": google_maps_url,
        "schedule": best_schedule
    }