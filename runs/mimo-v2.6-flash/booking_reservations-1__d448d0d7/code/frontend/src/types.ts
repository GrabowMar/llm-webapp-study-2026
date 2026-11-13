export interface Reservation {
  id: number;
  name: string;
  email: string;
  date: string;
  time: string;
  party_size: number;
  notes: string | null;
  created_at: string;
}

export interface Slot {
  time: string;
  booked: number;
  remaining: number;
}

export interface ReservationList {
  items: Reservation[];
  total: number;
}

export interface AvailabilityList {
  items: Slot[];
}

export interface AdminPage {
  items: Reservation[];
  total: number;
  page: number;
  page_size: number;
}

export interface ReservationDraft {
  name: string;
  email: string;
  date: string;
  time: string;
  party_size: number;
  notes: string | null;
}
