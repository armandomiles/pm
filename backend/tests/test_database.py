import pytest

from app.database import (
    create_board,
    create_user,
    delete_board,
    empty_board,
    get_board,
    get_user_by_username,
    initialize_database,
    list_boards,
    rename_board,
    save_board_content,
)


def test_initialize_database_seeds_bootstrap_user_and_board() -> None:
    initialize_database()

    user = get_user_by_username("user")

    assert user is not None
    boards = list_boards(user.id)
    assert len(boards) == 1
    assert boards[0].name == "My Board"


def test_create_user_hashes_password_and_rejects_duplicates() -> None:
    user = create_user("alice", "supersecret")

    assert user.username == "alice"
    assert user.password_hash != "supersecret"

    with pytest.raises(ValueError):
        create_user("alice", "different-password")


def test_get_user_by_username_returns_none_when_missing() -> None:
    assert get_user_by_username("nobody") is None


def test_create_and_get_board_round_trip() -> None:
    user = create_user("bob", "supersecret")
    board = empty_board()

    summary = create_board(user.id, "Sprint Board", board)
    fetched = get_board(summary.id, user.id)

    assert fetched == board
    assert [b.name for b in list_boards(user.id)] == ["Sprint Board"]


def test_get_board_returns_none_for_other_owner() -> None:
    owner = create_user("carol", "supersecret")
    other = create_user("dave", "supersecret")
    summary = create_board(owner.id, "Private", empty_board())

    assert get_board(summary.id, other.id) is None


def test_save_board_content_updates_json_and_reports_missing_board() -> None:
    user = create_user("erin", "supersecret")
    summary = create_board(user.id, "Board", empty_board())
    changed = empty_board()
    changed.columns[0].title = "Renamed Column"

    assert save_board_content(summary.id, user.id, changed) is True
    assert get_board(summary.id, user.id).columns[0].title == "Renamed Column"
    assert save_board_content("missing", user.id, changed) is False


def test_rename_board_updates_name_and_reports_missing_board() -> None:
    user = create_user("frank", "supersecret")
    summary = create_board(user.id, "Old name", empty_board())

    renamed = rename_board(summary.id, user.id, "New name")

    assert renamed is not None
    assert renamed.name == "New name"
    assert rename_board("missing", user.id, "New name") is None


def test_delete_board_removes_it_and_reports_missing_board() -> None:
    user = create_user("gina", "supersecret")
    summary = create_board(user.id, "Board", empty_board())

    assert delete_board(summary.id, user.id) is True
    assert get_board(summary.id, user.id) is None
    assert delete_board(summary.id, user.id) is False
