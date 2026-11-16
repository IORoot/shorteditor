from __future__ import annotations

import os
from datetime import datetime

from .models import FolderPreview, FolderPreviewRequest
from .token_template import ClipContext, FolderTemplate


class FolderPreviewer:
    def preview(self, request: FolderPreviewRequest, fallback_now: datetime) -> FolderPreview:
        template = FolderTemplate(request.folder_template)
        if template.uses_window() and request.group_by != "window":
            raise ValueError("{window:...} tokens need Group by: Window")
        when = datetime.fromisoformat(request.sample_date) if request.sample_date else fallback_now
        context = ClipContext(
            when=when,
            suffix=request.suffix,
            window_name=request.window_name,
            window_start=request.window_start,
        )
        relative = template.render(context)
        base = request.output_folder.rstrip("/")
        return FolderPreview(relative_path=relative, full_path=os.path.join(base, relative) if base else relative)
