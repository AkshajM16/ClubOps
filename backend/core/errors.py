class DomainError(Exception):
    def __init__(self, message: str, code: str = 'INVALID_INPUT'):
        super().__init__(message)
        self.code = code
