import csv
import asyncio
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import async_session_maker
from app.models.trail import Trail


async def import_trails_from_csv(csv_path: str):
    """Import trails from CSV — skips if trails already exist to avoid duplicates on restart."""
    async with async_session_maker() as session:
        result = await session.execute(select(func.count()).select_from(Trail))
        existing = result.scalar()
        if existing > 0:
            print(f"Database already has {existing} trails. Skipping import.")
            return

        print(f"Importing trails from {csv_path}...")
        count = 0
        with open(csv_path, 'r', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)

            for row in reader:
                terrain_types = row['terrain_types'].split('|') if row['terrain_types'] else []
                features = row['features'].split('|') if row['features'] else []
                best_months = [int(m) for m in row['best_months'].split('|')] if row['best_months'] else []

                trail = Trail(
                    name=row['name'],
                    region=row['region'],
                    trailhead_lat=float(row['trailhead_lat']),
                    trailhead_lon=float(row['trailhead_lon']),
                    trailhead_elevation=int(row['trailhead_elevation']),
                    highest_point_elevation=int(row['highest_point_elevation']),
                    distance_miles=float(row['distance_miles']),
                    elevation_gain_ft=int(row['elevation_gain_ft']),
                    trail_type=row['trail_type'],
                    difficulty=row['difficulty'],
                    technical_class=int(row['technical_class']),
                    exposure_level=int(row['exposure_level']),
                    terrain_types=terrain_types,
                    features=features,
                    typical_crowd_level=int(row['typical_crowd_level']),
                    dogs_allowed=row['dogs_allowed'].upper() == 'TRUE',
                    fee_required=row['fee_required'].upper() == 'TRUE',
                    best_months=best_months,
                    estimated_time_hours=float(row['estimated_time_hours']),
                    route_description=row['route_description'],
                    required_gear=[],
                    photos=[]
                )
                session.add(trail)
                count += 1

        await session.commit()
        print(f"Successfully imported {count} trails.")


if __name__ == "__main__":
    csv_file = Path(__file__).parent.parent / "data" / "trails.csv"
    asyncio.run(import_trails_from_csv(str(csv_file)))
