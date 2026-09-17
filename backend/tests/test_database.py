import pytest

from app.database import (
    add_board_member,
    create_board,
    create_user,
    delete_board,
    delete_user_account,
    empty_board,
    get_board,
    get_user_by_username,
    initialize_database,
    is_board_owner,
    list_board_members,
    list_boards,
    remove_board_member,
    rename_board,
    save_board_content,
    update_user_password,
)
from app.security import verify_password


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

    result, updated_at = save_board_content(summary.id, user.id, changed)
    assert result == "saved"
    assert updated_at is not None
    assert get_board(summary.id, user.id).columns[0].title == "Renamed Column"
    assert save_board_content("missing", user.id, changed) == ("not_found", None)


def test_save_board_content_rejects_a_stale_if_unmodified_since() -> None:
    user = create_user("fern", "supersecret")
    summary = create_board(user.id, "Board", empty_board())

    first_edit = empty_board()
    first_edit.columns[0].title = "First edit"
    result, first_updated_at = save_board_content(summary.id, user.id, first_edit)
    assert result == "saved"

    # A save that correctly references the version it read succeeds.
    second_edit = empty_board()
    second_edit.columns[0].title = "Second edit"
    result, second_updated_at = save_board_content(summary.id, user.id, second_edit, first_updated_at)
    assert result == "saved"
    assert second_updated_at is not None

    # A save still referencing the now-stale first_updated_at is rejected, since the
    # board has since moved on to second_updated_at without this caller seeing it.
    stale_edit = empty_board()
    stale_edit.columns[0].title = "Should be rejected"
    result, updated_at = save_board_content(summary.id, user.id, stale_edit, first_updated_at)

    assert result == "conflict"
    assert updated_at is None
    assert get_board(summary.id, user.id).columns[0].title == "Second edit"


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


def test_update_user_password_changes_the_stored_hash() -> None:
    user = create_user("hank", "original-password")

    assert update_user_password(user.id, "new-password") is True

    updated = get_user_by_username("hank")
    assert not verify_password("original-password", updated.password_hash)
    assert verify_password("new-password", updated.password_hash)


def test_update_user_password_reports_missing_user() -> None:
    assert update_user_password("nobody", "new-password") is False


def test_delete_user_account_removes_user_and_their_boards() -> None:
    user = create_user("iris", "supersecret")
    summary = create_board(user.id, "Board", empty_board())

    assert delete_user_account(user.id) is True
    assert get_user_by_username("iris") is None
    assert get_board(summary.id, user.id) is None


def test_delete_user_account_reports_missing_user() -> None:
    assert delete_user_account("nobody") is False


def test_list_board_members_starts_with_only_the_owner() -> None:
    owner = create_user("jack", "supersecret")
    summary = create_board(owner.id, "Board", empty_board())

    assert list_board_members(summary.id) == [owner.id]


def test_add_board_member_grants_access_and_appears_in_member_list() -> None:
    owner = create_user("kate", "supersecret")
    member = create_user("liam", "supersecret")
    summary = create_board(owner.id, "Board", empty_board())

    add_board_member(summary.id, member.id)

    assert list_board_members(summary.id) == [owner.id, member.id]
    assert get_board(summary.id, member.id) is not None


def test_add_board_member_is_idempotent() -> None:
    owner = create_user("mona", "supersecret")
    member = create_user("noah", "supersecret")
    summary = create_board(owner.id, "Board", empty_board())

    add_board_member(summary.id, member.id)
    add_board_member(summary.id, member.id)

    assert list_board_members(summary.id) == [owner.id, member.id]


def test_remove_board_member_revokes_access() -> None:
    owner = create_user("owen", "supersecret")
    member = create_user("paula", "supersecret")
    summary = create_board(owner.id, "Board", empty_board())
    add_board_member(summary.id, member.id)

    remove_board_member(summary.id, member.id)

    assert list_board_members(summary.id) == [owner.id]
    assert get_board(summary.id, member.id) is None


def test_member_can_edit_and_rename_but_only_owner_can_delete() -> None:
    owner = create_user("quinn", "supersecret")
    member = create_user("ruth", "supersecret")
    summary = create_board(owner.id, "Board", empty_board())
    add_board_member(summary.id, member.id)

    changed = empty_board()
    changed.columns[0].title = "Renamed by member"
    assert save_board_content(summary.id, member.id, changed)[0] == "saved"
    assert get_board(summary.id, owner.id).columns[0].title == "Renamed by member"

    renamed = rename_board(summary.id, member.id, "Renamed by member")
    assert renamed is not None
    assert renamed.is_owner is False

    assert delete_board(summary.id, member.id) is False
    assert delete_board(summary.id, owner.id) is True


def test_is_board_owner() -> None:
    owner = create_user("sam", "supersecret")
    member = create_user("tara", "supersecret")
    summary = create_board(owner.id, "Board", empty_board())
    add_board_member(summary.id, member.id)

    assert is_board_owner(summary.id, owner.id) is True
    assert is_board_owner(summary.id, member.id) is False


def test_list_boards_reports_ownership_for_shared_boards() -> None:
    owner = create_user("uma", "supersecret")
    member = create_user("vince", "supersecret")
    summary = create_board(owner.id, "Shared Board", empty_board())
    add_board_member(summary.id, member.id)

    owner_boards = {b.id: b for b in list_boards(owner.id)}
    member_boards = {b.id: b for b in list_boards(member.id)}

    assert owner_boards[summary.id].is_owner is True
    assert member_boards[summary.id].is_owner is False


def test_deleting_a_board_removes_its_membership_rows() -> None:
    owner = create_user("walt", "supersecret")
    member = create_user("xena", "supersecret")
    summary = create_board(owner.id, "Board", empty_board())
    add_board_member(summary.id, member.id)

    delete_board(summary.id, owner.id)

    assert list_board_members(summary.id) == []


def test_deleting_the_owner_account_removes_member_access_too() -> None:
    owner = create_user("yara", "supersecret")
    member = create_user("zane", "supersecret")
    summary = create_board(owner.id, "Board", empty_board())
    add_board_member(summary.id, member.id)

    delete_user_account(owner.id)

    assert get_board(summary.id, member.id) is None
    assert list_boards(member.id) == []


def test_deleting_a_member_account_removes_their_membership_elsewhere() -> None:
    owner = create_user("abel", "supersecret")
    member = create_user("cleo", "supersecret")
    summary = create_board(owner.id, "Board", empty_board())
    add_board_member(summary.id, member.id)

    delete_user_account(member.id)

    assert list_board_members(summary.id) == [owner.id]
