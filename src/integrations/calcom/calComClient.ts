export type CalComFetch = (input: string, init: RequestInit) => Promise<Response>;

export type CalComClientConfig = {
  token: string;
  baseUrl?: string;
  fetchImpl?: CalComFetch;
};

export type CalComAttendeeInput = {
  name: string;
  email: string;
  timeZone: string;
  phoneNumber?: string;
  language?: string;
};

export type CalComSlotQuery = {
  start: string;
  end: string;
  eventTypeId?: number;
  eventTypeSlug?: string;
  username?: string;
  teamSlug?: string;
  organizationSlug?: string;
  usernames?: string[];
  timeZone?: string;
  duration?: number;
  format?: "time" | "range";
  bookingUidToReschedule?: string;
};

export type CalComCreateBookingInput = {
  start: string;
  attendee: CalComAttendeeInput;
  eventTypeId?: number;
  eventTypeSlug?: string;
  username?: string;
  teamSlug?: string;
  organizationSlug?: string;
  bookingFieldsResponses?: Record<string, unknown>;
  guests?: string[];
  location?: Record<string, unknown>;
  metadata?: Record<string, string>;
  lengthInMinutes?: number;
  emailVerificationCode?: string;
};

export type CalComCancelBookingInput = {
  cancellationReason?: string;
  cancelSubsequentBookings?: boolean;
  seatUid?: string;
};

export type CalComRescheduleBookingInput = {
  start: string;
  rescheduledBy?: string;
  reschedulingReason?: string;
  emailVerificationCode?: string;
  seatUid?: string;
};

export type CalComApiResponse<T> = {
  status: "success" | "error";
  data?: T;
  error?: unknown;
};

export type CalComBooking = {
  id: number;
  uid: string;
  status?: string;
  start?: string;
  end?: string;
  duration?: number;
  eventTypeId?: number;
  title?: string;
};

export type CalComSlot = {
  start: string;
  end?: string;
};

export type CalComSlotsResponse = Record<string, CalComSlot[]>;

export class CalComApiError extends Error {
  readonly statusCode: number | undefined;
  readonly endpoint: string;

  constructor(message: string, endpoint: string, statusCode?: number) {
    super(message);
    this.name = "CalComApiError";
    this.endpoint = endpoint;
    this.statusCode = statusCode;
  }
}

const DEFAULT_BASE_URL = "https://api.cal.com";
const BOOKINGS_API_VERSION = "2026-02-25";
const SLOTS_API_VERSION = "2024-09-04";

export function createCalComClient(config: CalComClientConfig) {
  const token = normalizeToken(config.token);
  const baseUrl = normalizeBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL);
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    getAvailableSlots(query: CalComSlotQuery, signal?: AbortSignal): Promise<CalComSlotsResponse> {
      validateSlotQuery(query);
      return request<CalComSlotsResponse>(fetchImpl, baseUrl, token, "/v2/slots", {
        method: "GET",
        query: buildSlotQuery(query),
        apiVersion: SLOTS_API_VERSION,
        signal
      });
    },

    createBooking(input: CalComCreateBookingInput, signal?: AbortSignal): Promise<CalComBooking> {
      validateBookingInput(input);
      return request<CalComBooking>(fetchImpl, baseUrl, token, "/v2/bookings", {
        method: "POST",
        body: input,
        apiVersion: BOOKINGS_API_VERSION,
        signal
      });
    },

    cancelBooking(
      bookingUid: string,
      input: CalComCancelBookingInput = {},
      signal?: AbortSignal
    ): Promise<CalComBooking> {
      const uid = encodeURIComponent(normalizeRequiredString(bookingUid, "Booking uid is required"));
      return request<CalComBooking>(fetchImpl, baseUrl, token, `/v2/bookings/${uid}/cancel`, {
        method: "POST",
        body: input,
        apiVersion: BOOKINGS_API_VERSION,
        signal
      });
    },

    rescheduleBooking(
      bookingUid: string,
      input: CalComRescheduleBookingInput,
      signal?: AbortSignal
    ): Promise<CalComBooking> {
      const uid = encodeURIComponent(normalizeRequiredString(bookingUid, "Booking uid is required"));
      if (!isIsoUtcLike(input.start)) throw new Error("Reschedule start must be an ISO UTC timestamp");
      return request<CalComBooking>(fetchImpl, baseUrl, token, `/v2/bookings/${uid}/reschedule`, {
        method: "POST",
        body: input,
        apiVersion: BOOKINGS_API_VERSION,
        signal
      });
    }
  };
}

type RequestOptions = {
  method: "GET" | "POST";
  apiVersion: string;
  signal: AbortSignal | undefined;
  query?: URLSearchParams;
  body?: unknown;
};

async function request<T>(
  fetchImpl: CalComFetch,
  baseUrl: string,
  token: string,
  endpoint: string,
  options: RequestOptions
): Promise<T> {
  const url = new URL(endpoint, baseUrl);
  if (options.query) url.search = options.query.toString();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "cal-api-version": options.apiVersion
  };

  const init: RequestInit = {
    method: options.method,
    headers
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  if (options.signal !== undefined) {
    init.signal = options.signal;
  }

  const response = await fetchImpl(url.toString(), init);

  if (!response.ok) {
    throw new CalComApiError(`Cal.com request failed with status ${response.status}`, endpoint, response.status);
  }

  const payload = (await response.json()) as CalComApiResponse<T>;
  if (payload.status !== "success" || payload.data === undefined) {
    throw new CalComApiError("Cal.com response did not contain successful data", endpoint, response.status);
  }

  return payload.data;
}

function buildSlotQuery(query: CalComSlotQuery): URLSearchParams {
  const params = new URLSearchParams();
  append(params, "start", query.start);
  append(params, "end", query.end);
  append(params, "eventTypeId", query.eventTypeId?.toString());
  append(params, "eventTypeSlug", query.eventTypeSlug);
  append(params, "username", query.username);
  append(params, "teamSlug", query.teamSlug);
  append(params, "organizationSlug", query.organizationSlug);
  append(params, "usernames", query.usernames?.join(","));
  append(params, "timeZone", query.timeZone);
  append(params, "duration", query.duration?.toString());
  append(params, "format", query.format);
  append(params, "bookingUidToReschedule", query.bookingUidToReschedule);
  return params;
}

function validateSlotQuery(query: CalComSlotQuery): void {
  if (!isIsoUtcLike(query.start)) throw new Error("Slot query start must be an ISO UTC date or timestamp");
  if (!isIsoUtcLike(query.end)) throw new Error("Slot query end must be an ISO UTC date or timestamp");

  const hasEventTypeId = query.eventTypeId !== undefined;
  const hasIndividualSlug = Boolean(query.eventTypeSlug && query.username);
  const hasTeamSlug = Boolean(query.eventTypeSlug && query.teamSlug);
  const hasDynamicUsers = Boolean(query.usernames && query.usernames.length >= 2);

  if (!hasEventTypeId && !hasIndividualSlug && !hasTeamSlug && !hasDynamicUsers) {
    throw new Error("Slot query requires eventTypeId, eventTypeSlug with owner/team, or at least two usernames");
  }
}

function validateBookingInput(input: CalComCreateBookingInput): void {
  if (!isIsoUtcLike(input.start)) throw new Error("Booking start must be an ISO UTC timestamp");
  normalizeRequiredString(input.attendee.name, "Attendee name is required");
  normalizeRequiredString(input.attendee.email, "Attendee email is required");
  normalizeRequiredString(input.attendee.timeZone, "Attendee time zone is required");

  if (input.eventTypeId === undefined && !(input.eventTypeSlug && (input.username || input.teamSlug))) {
    throw new Error("Booking requires eventTypeId or eventTypeSlug with username/teamSlug");
  }
}

function normalizeToken(value: string): string {
  return normalizeRequiredString(value, "Cal.com token is required");
}

function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error("Cal.com base URL must use HTTPS");
  return parsed.toString().replace(/\/$/, "/");
}

function normalizeRequiredString(value: string, message: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(message);
  return normalized;
}

function isIsoUtcLike(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?Z)?$/.test(value);
}

function append(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined && value.length > 0) params.set(key, value);
}
