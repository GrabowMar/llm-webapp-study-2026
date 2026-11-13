export interface Reservation {
  id: number;
  name: string;
  email: string;
  date: string;
  time: string;
  party_size: number;
  notes: string;
  created_at: string;
}

export interface ReservationInput {
  name: string;
  email: string;
  date: string;
  time: string;
  party_size: number;
  notes: string;
}

export interface SlotAvailability {
  time: string;
  booked: number;
  remaining: number;
}

export interface ReservationList {
  items: Reservation[];
  total: number;
}

export interface AdminReservationList {
  items: Reservation[];
  total: number;
  page: number;
  page_size: number;
}

export interface AvailabilityList {
  items: SlotAvailability[];
}
