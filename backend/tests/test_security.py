from app.security import hash_password, verify_password


def test_verify_password_accepts_correct_password() -> None:
    hashed = hash_password("correct-horse-battery-staple")

    assert verify_password("correct-horse-battery-staple", hashed)


def test_verify_password_rejects_wrong_password() -> None:
    hashed = hash_password("correct-horse-battery-staple")

    assert not verify_password("wrong-password", hashed)


def test_hash_password_uses_a_random_salt_per_call() -> None:
    first = hash_password("same-password")
    second = hash_password("same-password")

    assert first != second
    assert verify_password("same-password", first)
    assert verify_password("same-password", second)


def test_verify_password_rejects_malformed_hash() -> None:
    assert not verify_password("anything", "not-a-valid-hash")
