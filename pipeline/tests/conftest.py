# Import flyover before any test module imports rasterio: its __init__ clears PROJ_LIB and
# GDAL_DATA, and PROJ locks onto whatever database it sees when rasterio first loads.
import flyover  # noqa: F401
