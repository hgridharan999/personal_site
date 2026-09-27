"""Flyover pipeline: hike GPX tracks to streamable terrain tiles.

rasterio and pyproj ship their own GDAL and PROJ data inside their wheels. A system-wide
PROJ_LIB or GDAL_DATA (the Windows PostGIS installer sets both) points them at an older
database instead and breaks every EPSG lookup, so drop those variables before either
library loads.
"""

import os

for _var in ("PROJ_LIB", "PROJ_DATA", "GDAL_DATA"):
    os.environ.pop(_var, None)
