"""Shared password hashing — argon2-cffi + bcrypt (no passlib).

passlib was dropped because it imports Python's `crypt` module which was
removed in Python 3.13.  This module exposes the same interface that the
rest of the codebase used via passlib's CryptContext:

    pwd_ctx.hash(password)          -> str
    pwd_ctx.verify(password, hash)  -> bool  (raises UnknownHashError)
    pwd_ctx.needs_update(hash)      -> bool

Schemes:
  - New hashes:  argon2id  (via argon2-cffi)
  - Legacy:      bcrypt    (verified but flagged for rehash on next login)
"""
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
import bcrypt as _bcrypt


class UnknownHashError(Exception):
    """Raised when the stored hash is in an unrecognised format."""


_ph = PasswordHasher()


class _PwdCtx:
    def hash(self, password: str) -> str:
        return _ph.hash(password)

    def verify(self, password: str, hash: str) -> bool:
        if hash.startswith("$argon2"):
            try:
                return _ph.verify(hash, password)
            except VerifyMismatchError:
                return False
            except (VerificationError, InvalidHashError) as exc:
                raise UnknownHashError(str(exc)) from exc

        if hash.startswith(("$2b$", "$2a$", "$2y$")):
            try:
                return _bcrypt.checkpw(password.encode(), hash.encode())
            except Exception as exc:
                raise UnknownHashError(str(exc)) from exc

        raise UnknownHashError(f"Unrecognised hash format: {hash[:20]!r}")

    def needs_update(self, hash: str) -> bool:
        if hash.startswith("$argon2"):
            return _ph.check_needs_rehash(hash)
        # bcrypt hashes are always upgraded to argon2 on next login
        return hash.startswith(("$2b$", "$2a$", "$2y$"))


pwd_ctx = _PwdCtx()
