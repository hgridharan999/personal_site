from typing import Optional
from datetime import date


def apply_hard_rules(
    trail: dict,
    user_profile: dict,
    weather: Optional[dict],
    conditions: Optional[dict],
    gear: list[str]
) -> tuple[float, list[str]]:
    """
    Apply hard rule penalties to base confidence score.
    Returns (confidence_score, list_of_concerns)
    """
    confidence = 100.0
    concerns = []

    if conditions and conditions.get("trail_status") == "closed":
        return 0, ["Trail is officially closed"]

    if weather and weather.get("weather_summary"):
        summary_lower = weather["weather_summary"].lower()
        if "thunder" in summary_lower and trail.get("exposure_level", 1) >= 3:
            confidence = min(confidence, 30)
            concerns.append("High lightning risk on exposed sections - start early or reconsider")

    required_gear = set(trail.get("required_gear", []))
    if conditions and conditions.get("required_gear"):
        required_gear.update(conditions["required_gear"])
    user_gear_set = set(gear or [])

    if "microspikes" in required_gear and "microspikes" not in user_gear_set:
        if conditions and conditions.get("trail_status") in ("icy", "snowy"):
            confidence = min(confidence, 25)
            concerns.append("Trail conditions require microspikes")

    if "ice_axe" in required_gear and "ice_axe" not in user_gear_set:
        if trail.get("technical_class", 1) >= 3 and conditions and conditions.get("snow_level_ft"):
            confidence = min(confidence, 20)
            concerns.append("Snow on technical terrain - ice axe required")

    pace_map = {"slow": 2.0, "moderate": 3.0, "fast": 4.0}
    pace = user_profile.get("fitness", {}).get("pace", "moderate")
    pace_mph = pace_map.get(pace, 3.0)

    flat_time = trail.get("distance_miles", 0) / pace_mph
    climb_time = trail.get("elevation_gain_ft", 0) / 2000
    estimated_time = flat_time + climb_time

    max_hours = user_profile.get("fitness", {}).get("max_hours", 6)
    if estimated_time > max_hours * 1.5:
        confidence = min(confidence, 40)
        concerns.append(f"Estimated {estimated_time:.1f} hours exceeds your capacity")
    elif estimated_time > max_hours:
        confidence = min(confidence, 65)
        concerns.append(f"Estimated {estimated_time:.1f} hours is at your limit")

    max_gain = user_profile.get("fitness", {}).get("max_elevation_gain", 3000)
    trail_gain = trail.get("elevation_gain_ft", 0)
    if trail_gain > max_gain * 1.3:
        confidence = min(confidence, 50)
        concerns.append(f"{trail_gain} ft gain significantly exceeds your usual {max_gain} ft")

    exposure_comfort = user_profile.get("technical", {}).get("exposure_comfort", 3)
    trail_exposure = trail.get("exposure_level", 1)
    if trail_exposure > exposure_comfort + 1:
        confidence = min(confidence, 55)
        concerns.append("Trail exposure exceeds your comfort level")

    scrambling_comfort = user_profile.get("technical", {}).get("scrambling_comfort", False)
    if trail.get("technical_class", 1) >= 2 and not scrambling_comfort:
        confidence = min(confidence, 50)
        concerns.append("Trail requires scrambling")

    if weather and weather.get("temperature_f") is not None:
        temp = weather["temperature_f"]
        cold_tolerance = user_profile.get("personal", {}).get("cold_tolerance", 3)
        if temp < 20 and cold_tolerance < 3:
            confidence -= 10
            concerns.append(f"Expected {temp}°F - dress warmly")

    return confidence, concerns


def generate_breakdown(
    trail: dict,
    user_profile: dict,
    weather: Optional[dict],
    conditions: Optional[dict],
    gear: list[str],
    confidence: float,
    concerns: list[str]
) -> dict:
    """Generate the 4-category breakdown for UI"""
    breakdown = {
        "capability": {"status": "good", "notes": ""},
        "weather": {"status": "good", "notes": ""},
        "conditions": {"status": "good", "notes": ""},
        "gear": {"status": "good", "notes": ""}
    }

    pace_map = {"slow": 2.0, "moderate": 3.0, "fast": 4.0}
    pace = user_profile.get("fitness", {}).get("pace", "moderate")
    pace_mph = pace_map.get(pace, 3.0)

    flat_time = trail.get("distance_miles", 0) / pace_mph
    climb_time = trail.get("elevation_gain_ft", 0) / 2000
    estimated_time = flat_time + climb_time
    max_hours = user_profile.get("fitness", {}).get("max_hours", 6)

    if estimated_time > max_hours * 1.5:
        breakdown["capability"]["status"] = "bad"
        breakdown["capability"]["notes"] = f"Estimated {estimated_time:.1f}h exceeds your {max_hours}h capacity"
    elif estimated_time > max_hours:
        breakdown["capability"]["status"] = "warning"
        breakdown["capability"]["notes"] = f"Estimated {estimated_time:.1f}h is at your {max_hours}h limit"
    else:
        breakdown["capability"]["status"] = "good"
        breakdown["capability"]["notes"] = f"Estimated {estimated_time:.1f}h within your {max_hours}h capacity"

    if weather:
        temp = weather.get("temperature_f")
        precip = weather.get("precipitation_prob", 0)
        summary = weather.get("weather_summary", "")

        if "thunder" in summary.lower():
            breakdown["weather"]["status"] = "bad"
            breakdown["weather"]["notes"] = f"{summary} - High lightning risk"
        elif precip > 70:
            breakdown["weather"]["status"] = "warning"
            breakdown["weather"]["notes"] = f"{precip}% chance of precipitation"
        elif temp and temp < 20:
            breakdown["weather"]["status"] = "warning"
            breakdown["weather"]["notes"] = f"Cold conditions ({temp}°F)"
        else:
            breakdown["weather"]["status"] = "good"
            breakdown["weather"]["notes"] = f"{summary or 'Clear conditions'}"
    else:
        breakdown["weather"]["notes"] = "No forecast available"

    if conditions:
        status = conditions.get("trail_status")
        if status == "closed":
            breakdown["conditions"]["status"] = "bad"
            breakdown["conditions"]["notes"] = "Trail closed"
        elif status in ("icy", "snowy"):
            breakdown["conditions"]["status"] = "warning"
            breakdown["conditions"]["notes"] = f"Trail is {status}"
        elif status == "clear":
            breakdown["conditions"]["status"] = "good"
            breakdown["conditions"]["notes"] = "Trail clear and dry"
        else:
            breakdown["conditions"]["notes"] = status or "Unknown conditions"
    else:
        breakdown["conditions"]["notes"] = "No recent condition reports"

    required_gear = set(trail.get("required_gear", []))
    if conditions and conditions.get("required_gear"):
        required_gear.update(conditions["required_gear"])
    user_gear_set = set(gear or [])

    missing = required_gear - user_gear_set
    if missing:
        breakdown["gear"]["status"] = "warning"
        breakdown["gear"]["notes"] = f"Consider: {', '.join(missing)}"
    else:
        breakdown["gear"]["status"] = "good"
        breakdown["gear"]["notes"] = "All recommended gear available"

    return breakdown


def get_recommendation(confidence: float) -> str:
    """Convert confidence score to recommendation category"""
    if confidence >= 80:
        return "go"
    elif confidence >= 60:
        return "caution"
    elif confidence >= 40:
        return "reconsider"
    else:
        return "dont-go"


def calculate_naismith_time(trail: dict, user_profile: dict) -> float:
    """Calculate estimated hiking time using Naismith's Rule"""
    pace_map = {"slow": 2.0, "moderate": 3.0, "fast": 4.0}
    pace = user_profile.get("fitness", {}).get("pace", "moderate")
    pace_mph = pace_map.get(pace, 3.0)

    flat_time = trail.get("distance_miles", 0) / pace_mph
    climb_time = trail.get("elevation_gain_ft", 0) / 2000

    return flat_time + climb_time
