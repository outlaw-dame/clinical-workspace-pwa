import { describe, expect, it, vi } from "vitest";
import { CalComApiError, createCalComClient, type CalComFetch } from "./calComClient";

describe("createCalComClient", () => {
  it("fetches available slots with the slots API version and query parameters", async () => {
    const fetchImpl = createFetch({ "2050-09-05": [{ start: "2050-09-05T09:00:00.000Z" }] });
    const client = createCalComClient({ token: "cal_test", fetchImpl });

    await expect(
      client.getAvailableSlots({
        eventTypeId: 10,
        start: "2050-09-05",
        end: "2050-09-06",
        timeZone: "America/New_York",
        format: "range",
        duration: 60
      })
    ).resolves.toEqual({ "2050-09-05": [{ start: "2050-09-05T09:00:00.000Z" }] });

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toContain("https://api.cal.com/v2/slots?");
    expect(url).toContain("eventTypeId=10");
    expect(url).toContain("start=2050-09-05");
    expect(url).toContain("end=2050-09-06");
    expect(url).toContain("timeZone=America%2FNew_York");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer cal_test", "cal-api-version": "2024-09-04" });
  });

  it("creates a booking with booking API version and JSON body", async () => {
    const fetchImpl = createFetch({ id: 1, uid: "booking-1", status: "accepted" });
    const client = createCalComClient({ token: "cal_test", fetchImpl });

    await expect(
      client.createBooking({
        start: "2026-06-10T14:00:00Z",
        eventTypeId: 25,
        attendee: {
          name: "Client",
          email: "client@example.test",
          timeZone: "America/New_York"
        },
        metadata: { source: "clinical-workspace" }
      })
    ).resolves.toEqual({ id: 1, uid: "booking-1", status: "accepted" });

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://api.cal.com/v2/bookings");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer cal_test",
      "cal-api-version": "2026-02-25",
      "Content-Type": "application/json"
    });
    expect(JSON.parse(init?.body as string)).toMatchObject({ eventTypeId: 25, start: "2026-06-10T14:00:00Z" });
  });

  it("cancels and reschedules bookings without leaking token into URLs", async () => {
    const fetchImpl = createFetch({ id: 1, uid: "booking-1" });
    const client = createCalComClient({ token: "cal_test_secret", fetchImpl });

    await client.cancelBooking("booking uid/1", { cancellationReason: "not available" });
    await client.rescheduleBooking("booking uid/1", { start: "2026-06-10T15:00:00Z" });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://api.cal.com/v2/bookings/booking%20uid%2F1/cancel");
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("https://api.cal.com/v2/bookings/booking%20uid%2F1/reschedule");
    expect(JSON.stringify(fetchImpl.mock.calls.map(([url]) => url))).not.toContain("cal_test_secret");
  });

  it("rejects invalid inputs before network calls", async () => {
    const fetchImpl = createFetch({});
    const client = createCalComClient({ token: "cal_test", fetchImpl });

    await expect(client.getAvailableSlots({ start: "bad", end: "2050-09-06", eventTypeId: 1 })).rejects.toThrow(
      "Slot query start must be an ISO UTC date or timestamp"
    );
    await expect(
      client.createBooking({
        start: "2026-06-10T14:00:00Z",
        attendee: { name: "Client", email: "client@example.test", timeZone: "America/New_York" }
      })
    ).rejects.toThrow("Booking requires eventTypeId or eventTypeSlug with username/teamSlug");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws a privacy-safe API error for non-2xx responses", async () => {
    const fetchImpl = createFetch({ message: "remote detail should not appear" }, false, 429);
    const client = createCalComClient({ token: "cal_test", fetchImpl });

    await expect(
      client.getAvailableSlots({ start: "2050-09-05", end: "2050-09-06", eventTypeId: 10 })
    ).rejects.toMatchObject({
      name: "CalComApiError",
      statusCode: 429,
      endpoint: "/v2/slots"
    } satisfies Partial<CalComApiError>);

    await expect(
      client.getAvailableSlots({ start: "2050-09-05", end: "2050-09-06", eventTypeId: 10 })
    ).rejects.not.toThrow("remote detail should not appear");
  });
});

function createFetch(data: unknown, ok = true, status = ok ? 200 : 500) {
  return vi.fn<CalComFetch>(() =>
    Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(ok ? { status: "success", data } : { status: "error", error: data })
    } as Response)
  );
}
