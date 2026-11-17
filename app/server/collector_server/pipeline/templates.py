from __future__ import annotations

TEMPLATE_KEYS = ["scan_folder", "order_clips", "limit_length", "join_pieces", "render_output"]


def defaults_from_schema(schema: dict) -> dict:
    """The stage's own defaults, under the schema's own (camelCase) names."""
    return {name: prop["default"] for name, prop in schema.get("properties", {}).items() if prop.get("default") is not None}
