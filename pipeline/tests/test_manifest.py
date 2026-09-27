import json
from pathlib import Path

import pytest
from pydantic import ValidationError
from sample import sample_manifest

from flyover.manifest import Manifest, to_json

FIXTURE = Path(__file__).parent / "fixtures" / "manifest.sample.json"


def test_sample_manifest_fixture_is_current():
    """Regenerates the fixture the site's Zod schema is tested against (the contract test)."""
    data = to_json(sample_manifest())
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_bytes(data)
    assert Manifest.model_validate_json(FIXTURE.read_bytes()) == sample_manifest()


def test_manifest_json_uses_camel_case_and_utc_z():
    doc = json.loads(to_json(sample_manifest()))
    assert doc["version"] == 1 and doc["startTime"] == "2026-07-12T11:00:00Z"
    assert set(doc["stats"]) == {"distanceM", "gainM", "movingS", "totalS", "ascentRateMPerH"}
    assert doc["playback"] == {"durationS": 150.0, "summitS": 10.0, "photoS": 2.5, "stopS": 1.0}
    assert doc["tiles"]["demZooms"] == [8, 17] and doc["tiles"]["imgZooms"] == [8, 18]
    assert doc["summit"]["idx"] == 20 and doc["stops"][0]["startIdx"] == 11
    assert doc["track"]["moving"][12] == 0
    assert all(len(row) == 3 for rows in doc["tiles"]["coverage"].values() for row in rows)
    assert doc["attribution"] == "Elevation: USGS 3DEP · Imagery: USDA NAIP"


def test_rejects_ragged_track_columns():
    doc = json.loads(to_json(sample_manifest()))
    doc["track"]["ele"].pop()
    with pytest.raises(ValidationError, match="same length"):
        Manifest.model_validate(doc)


def test_rejects_an_index_past_the_track():
    doc = json.loads(to_json(sample_manifest()))
    doc["photos"][0]["idx"] = 999
    with pytest.raises(ValidationError, match="past the"):
        Manifest.model_validate(doc)


def test_rejects_unknown_fields():
    doc = json.loads(to_json(sample_manifest()))
    doc["surprise"] = True
    with pytest.raises(ValidationError):
        Manifest.model_validate(doc)
