"""Helpers for mounting the Python services as Vercel serverless functions."""


class StripPrefix:
    """ASGI wrapper: Vercel passes the original request path (e.g. /api/engine/api/v1/health);
    the wrapped app expects paths without the public prefix."""

    def __init__(self, app, prefix: str):
        self.app = app
        self.prefix = prefix.rstrip("/")

    async def __call__(self, scope, receive, send):
        if scope.get("type") in ("http", "websocket"):
            path = scope.get("path", "")
            if path.startswith(self.prefix):
                scope = dict(scope)
                scope["path"] = path[len(self.prefix):] or "/"
                scope["raw_path"] = scope["path"].encode()
        await self.app(scope, receive, send)
