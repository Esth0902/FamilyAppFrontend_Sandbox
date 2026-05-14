/* eslint-env jest */
import { apiFetch } from "@/src/api/client";
import {
  fetchHouseholdMembers,
  saveCalendarEvent,
} from "@/src/services/calendarService";

jest.mock("@/src/api/client", () => ({
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe("calendarService", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it("sends the new audience and RSVP fields when saving an event", async () => {
    mockApiFetch.mockResolvedValue(undefined as never);

    await saveCalendarEvent({
      title: "Test event",
      description: "Desc",
      start_at: "2026-05-10T18:00:00.000Z",
      end_at: "2026-05-10T19:00:00.000Z",
      is_shared_with_other_household: false,
      audience_mode: "selected_members",
      invited_user_ids: [2, 3],
      response_required: false,
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/calendar/events",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          title: "Test event",
          description: "Desc",
          start_at: "2026-05-10T18:00:00.000Z",
          end_at: "2026-05-10T19:00:00.000Z",
          is_shared_with_other_household: false,
          audience_mode: "selected_members",
          invited_user_ids: [2, 3],
          response_required: false,
        }),
      })
    );
  });

  it("maps household members safely", async () => {
    mockApiFetch.mockResolvedValueOnce({
      members: [
        { id: 1, name: "Parent One", role: "parent" },
        { id: 2, name: "Child One", role: "enfant" },
        { id: 0, name: "Invalid", role: "enfant" },
      ],
    } as never);

    await expect(fetchHouseholdMembers()).resolves.toEqual([
      { id: 1, name: "Parent One", role: "parent" },
      { id: 2, name: "Child One", role: "enfant" },
    ]);

    expect(mockApiFetch).toHaveBeenCalledWith("/household/members");
  });
});
