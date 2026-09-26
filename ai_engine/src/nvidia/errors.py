class NvidiaError(Exception):
    """An NVIDIA model call failed. `status` is the HTTP status the engine should return."""

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


class NvidiaNotConfigured(NvidiaError):
    def __init__(self, message: str):
        super().__init__(message, status=503)
