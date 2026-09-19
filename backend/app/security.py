import hashlib
import hmac
import os

_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_KEY_LENGTH = 32


def _derive_key(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=_KEY_LENGTH
    )


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    return f"{salt.hex()}${_derive_key(password, salt).hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        salt_hex, digest_hex = password_hash.split("$", 1)
        salt = bytes.fromhex(salt_hex)
    except ValueError:
        return False
    return hmac.compare_digest(_derive_key(password, salt).hex(), digest_hex)
