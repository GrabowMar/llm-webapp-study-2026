import { renderToString } from "react-dom/server";
import { useCallback, useEffect, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
// src/api.ts
var TOKEN_KEY = "reservations.token";
var USERNAME_KEY = "reservations.username";
var ApiError = class extends Error {
	status;
	constructor(message, status) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
};
function getToken() {
	return localStorage.getItem(TOKEN_KEY);
}
function getStoredUsername() {
	return localStorage.getItem(USERNAME_KEY);
}
function storeSession(username, token) {
	localStorage.setItem(TOKEN_KEY, token);
	localStorage.setItem(USERNAME_KEY, username);
}
function clearSession() {
	localStorage.removeItem(TOKEN_KEY);
	localStorage.removeItem(USERNAME_KEY);
}
async function api(path, options = {}) {
	const headers = {};
	const token = getToken();
	if (token) headers["Authorization"] = `Bearer ${token}`;
	if (options.body !== void 0) headers["Content-Type"] = "application/json";
	const response = await fetch(path, {
		method: options.method ?? "GET",
		headers,
		body: options.body === void 0 ? void 0 : JSON.stringify(options.body)
	});
	const text = await response.text();
	let payload = null;
	if (text) try {
		payload = JSON.parse(text);
	} catch {
		payload = null;
	}
	if (!response.ok) throw new ApiError(payload !== null && typeof payload === "object" && "error" in payload ? String(payload.error) : `Request failed (${response.status})`, response.status);
	return payload;
}
// src/ui.ts
var card = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";
var heading = "text-lg font-semibold text-slate-900";
var label = "mb-1 block text-sm font-medium text-slate-700";
var input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";
var primaryButton = "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";
var secondaryButton = "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
var dangerButton = "rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50";
var smallMuted = "text-xs text-slate-500";
function todayISO() {
	const now = /* @__PURE__ */ new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function shiftDay(date, delta) {
	const parsed = /* @__PURE__ */ new Date(`${date}T12:00:00`);
	if (Number.isNaN(parsed.getTime())) return todayISO();
	parsed.setDate(parsed.getDate() + delta);
	return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}
function formatDay(date) {
	const parsed = /* @__PURE__ */ new Date(`${date}T00:00:00`);
	if (Number.isNaN(parsed.getTime())) return date;
	return parsed.toLocaleDateString(void 0, {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric"
	});
}
// src/components/DayPicker.tsx
function DayPicker({ date, onDateChange }) {
	return /* @__PURE__ */ jsxs("div", {
		className: "flex items-end gap-2",
		children: [
			/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("label", {
				className: label,
				htmlFor: "day-picker",
				children: "Day"
			}), /* @__PURE__ */ jsx("input", {
				className: `${input} w-44`,
				id: "day-picker",
				type: "date",
				value: date,
				onChange: (event) => {
					if (event.target.value) onDateChange(event.target.value);
				}
			})] }),
			/* @__PURE__ */ jsx("button", {
				className: secondaryButton,
				type: "button",
				onClick: () => onDateChange(shiftDay(date, -1)),
				children: "Previous"
			}),
			/* @__PURE__ */ jsx("button", {
				className: secondaryButton,
				type: "button",
				onClick: () => onDateChange(shiftDay(date, 1)),
				children: "Next"
			})
		]
	});
}
// src/components/AdminPanel.tsx
function AdminPanel({ date, onDateChange, onUnauthorized }) {
	const [page, setPage] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const load = useCallback(async () => {
		setLoading(true);
		try {
			const result = await api(`/api/admin/reservations?date=${encodeURIComponent(date)}&page=1&page_size=1000`);
			setPage(result);
			setError(null);
		} catch (cause) {
			if (cause instanceof ApiError && cause.status === 401) {
				onUnauthorized();
				return;
			}
			setPage(null);
			setError(cause instanceof ApiError ? cause.message : "Something went wrong");
		} finally {
			setLoading(false);
		}
	}, [date, onUnauthorized]);
	useEffect(() => {
		load();
	}, [load]);
	const guests = page ? page.items.reduce((total, item) => total + item.party_size, 0) : 0;
	return /* @__PURE__ */ jsxs("section", {
		className: card,
		"aria-label": "Admin reservations",
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "mb-5 flex flex-wrap items-end justify-between gap-4",
				children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h2", {
					className: heading,
					children: "All reservations"
				}), /* @__PURE__ */ jsx("p", {
					className: smallMuted,
					children: "Every guest's booking for the chosen day."
				})] }), /* @__PURE__ */ jsx(DayPicker, {
					date,
					onDateChange
				})]
			}),
			/* @__PURE__ */ jsx("p", {
				className: "mb-4 text-sm text-slate-600",
				children: formatDay(date)
			}),
			error && /* @__PURE__ */ jsx("p", {
				className: "mb-4 text-sm text-red-700",
				children: error
			}),
			loading ? /* @__PURE__ */ jsx("p", {
				className: smallMuted,
				children: "Loading reservations…"
			}) : !page || page.items.length === 0 ? /* @__PURE__ */ jsx("div", {
				className: "rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center",
				children: /* @__PURE__ */ jsx("p", {
					className: "text-sm font-medium text-slate-700",
					children: "No reservations on this day"
				})
			}) : /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsxs("div", {
				className: "mb-4 flex flex-wrap gap-3",
				children: [/* @__PURE__ */ jsxs("span", {
					className: "rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-800",
					children: [
						page.total,
						" ",
						page.total === 1 ? "reservation" : "reservations"
					]
				}), /* @__PURE__ */ jsxs("span", {
					className: "rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800",
					children: [
						guests,
						" ",
						guests === 1 ? "guest" : "guests",
						" in total"
					]
				})]
			}), /* @__PURE__ */ jsx("div", {
				className: "overflow-x-auto rounded-xl border border-slate-200",
				children: /* @__PURE__ */ jsxs("table", {
					className: "w-full text-left text-sm",
					children: [/* @__PURE__ */ jsx("thead", {
						className: "bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500",
						children: /* @__PURE__ */ jsxs("tr", { children: [
							/* @__PURE__ */ jsx("th", {
								className: "px-4 py-2.5",
								children: "Time"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "px-4 py-2.5",
								children: "Name"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "px-4 py-2.5",
								children: "Email"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "px-4 py-2.5 text-right",
								children: "Party"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "px-4 py-2.5",
								children: "Notes"
							})
						] })
					}), /* @__PURE__ */ jsx("tbody", { children: page.items.map((reservation) => /* @__PURE__ */ jsxs("tr", {
						className: "border-t border-slate-200 bg-white",
						children: [
							/* @__PURE__ */ jsx("td", {
								className: "px-4 py-2.5 font-medium text-slate-900",
								children: reservation.time
							}),
							/* @__PURE__ */ jsx("td", {
								className: "px-4 py-2.5 text-slate-700",
								children: reservation.name
							}),
							/* @__PURE__ */ jsx("td", {
								className: "px-4 py-2.5 text-slate-600",
								children: reservation.email
							}),
							/* @__PURE__ */ jsx("td", {
								className: "px-4 py-2.5 text-right text-slate-700",
								children: reservation.party_size
							}),
							/* @__PURE__ */ jsx("td", {
								className: "px-4 py-2.5 text-slate-500",
								children: reservation.notes ?? "—"
							})
						]
					}, reservation.id)) })]
				})
			})] })
		]
	});
}
// src/components/AvailabilityPanel.tsx
function AvailabilityPanel({ date, slots, loading, error, signedIn, onDateChange, onBook }) {
	return /* @__PURE__ */ jsxs("section", {
		className: card,
		"aria-label": "Availability",
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "mb-5 flex flex-wrap items-end justify-between gap-4",
				children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h2", {
					className: heading,
					children: "Availability"
				}), /* @__PURE__ */ jsx("p", {
					className: smallMuted,
					children: "Every slot seats at most 20 guests."
				})] }), /* @__PURE__ */ jsx(DayPicker, {
					date,
					onDateChange
				})]
			}),
			/* @__PURE__ */ jsx("p", {
				className: "mb-4 text-sm text-slate-600",
				children: formatDay(date)
			}),
			error && /* @__PURE__ */ jsx("p", {
				className: "mb-4 text-sm text-red-700",
				children: error
			}),
			loading ? /* @__PURE__ */ jsx("p", {
				className: smallMuted,
				children: "Loading slots…"
			}) : slots.length === 0 ? /* @__PURE__ */ jsxs("div", {
				className: "rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center",
				children: [/* @__PURE__ */ jsx("p", {
					className: "text-sm font-medium text-slate-700",
					children: "No reservations on this day yet"
				}), /* @__PURE__ */ jsx("p", {
					className: `${smallMuted} mt-1`,
					children: "All 20 seats per time slot are still available."
				})]
			}) : /* @__PURE__ */ jsx("ul", {
				className: "space-y-3",
				children: slots.map((slot) => {
					const percent = Math.round(slot.booked / 20 * 100);
					const full = slot.remaining === 0;
					return /* @__PURE__ */ jsxs("li", {
						className: "rounded-xl border border-slate-200 bg-slate-50 px-4 py-3",
						children: [/* @__PURE__ */ jsxs("div", {
							className: "flex flex-wrap items-center justify-between gap-3",
							children: [/* @__PURE__ */ jsxs("div", {
								className: "flex items-center gap-3",
								children: [/* @__PURE__ */ jsx("span", {
									className: "text-base font-semibold text-slate-900",
									children: slot.time
								}), /* @__PURE__ */ jsxs("span", {
									className: `rounded-full px-2 py-0.5 text-xs font-medium ${full ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"}`,
									children: [
										slot.booked,
										" of 20 booked · ",
										slot.remaining,
										" remaining"
									]
								})]
							}), signedIn ? /* @__PURE__ */ jsx("button", {
								className: secondaryButton,
								type: "button",
								onClick: () => onBook(slot),
								children: "Book this slot"
							}) : /* @__PURE__ */ jsx("span", {
								className: smallMuted,
								children: "Sign in to book this slot"
							})]
						}), /* @__PURE__ */ jsx("div", {
							className: "mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200",
							children: /* @__PURE__ */ jsx("div", {
								className: `h-2 rounded-full ${full ? "bg-red-500" : "bg-emerald-500"}`,
								style: { width: `${percent}%` }
							})
						})]
					}, slot.time);
				})
			})
		]
	});
}
// src/components/BookingForm.tsx
function BookingForm({ editing, seed, slots, day, onSaved, onCancelEdit, onUnauthorized }) {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [date, setDate] = useState(seed.date);
	const [time, setTime] = useState(seed.time);
	const [partySize, setPartySize] = useState("2");
	const [notes, setNotes] = useState("");
	const [message, setMessage] = useState(null);
	const [busy, setBusy] = useState(false);
	useEffect(() => {
		setDate(seed.date);
		setTime(seed.time);
		setMessage(null);
	}, [
		seed.nonce,
		seed.date,
		seed.time
	]);
	useEffect(() => {
		if (editing) {
			setName(editing.name);
			setEmail(editing.email);
			setDate(editing.date);
			setTime(editing.time);
			setPartySize(String(editing.party_size));
			setNotes(editing.notes ?? "");
			setMessage(null);
		} else {
			setName("");
			setEmail("");
			setPartySize("2");
			setNotes("");
		}
	}, [editing]);
	async function submit(event) {
		event.preventDefault();
		const size = Number(partySize);
		if (!name.trim() || !email.trim() || !date || !time) {
			setMessage({
				kind: "error",
				text: "Fill in every required field."
			});
			return;
		}
		if (!Number.isInteger(size) || size < 1) {
			setMessage({
				kind: "error",
				text: "Party size must be a positive whole number."
			});
			return;
		}
		const body = {
			name: name.trim(),
			email: email.trim(),
			date,
			time,
			party_size: size,
			notes: notes.trim() ? notes.trim() : null
		};
		setBusy(true);
		setMessage(null);
		try {
			if (editing) {
				await api(`/api/reservations/${editing.id}`, {
					method: "PUT",
					body
				});
				setMessage({
					kind: "success",
					text: "Reservation updated."
				});
				onCancelEdit();
			} else {
				await api("/api/reservations", {
					method: "POST",
					body
				});
				setMessage({
					kind: "success",
					text: `Table booked for ${date} at ${time}.`
				});
				setName("");
				setEmail("");
				setNotes("");
			}
			onSaved();
		} catch (cause) {
			if (cause instanceof ApiError && cause.status === 401) {
				onUnauthorized?.();
				return;
			}
			setMessage({
				kind: "error",
				text: cause instanceof ApiError ? cause.message : "Something went wrong"
			});
		} finally {
			setBusy(false);
		}
	}
	const slot = date === day ? slots.find((item) => item.time === time) : void 0;
	return /* @__PURE__ */ jsxs("section", {
		className: card,
		"aria-label": "Booking form",
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "mb-5 flex flex-wrap items-center justify-between gap-3",
				children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h2", {
					className: heading,
					children: editing ? "Edit reservation" : "Book a table"
				}), editing && /* @__PURE__ */ jsxs("p", {
					className: "text-xs text-slate-500",
					children: [
						"Reservation #",
						editing.id,
						" · ",
						formatDay(editing.date),
						" at ",
						editing.time
					]
				})] }), editing && /* @__PURE__ */ jsx("button", {
					className: "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
					type: "button",
					onClick: onCancelEdit,
					children: "Cancel edit"
				})]
			}),
			message && /* @__PURE__ */ jsx("p", {
				className: `${message.kind === "success" ? "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" : "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"} mb-4`,
				role: "alert",
				children: message.text
			}),
			/* @__PURE__ */ jsxs("form", {
				className: "space-y-4",
				onSubmit: submit,
				children: [/* @__PURE__ */ jsxs("div", {
					className: "grid gap-4 sm:grid-cols-2",
					children: [
						/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("label", {
							className: label,
							htmlFor: "booking-name",
							children: "Name"
						}), /* @__PURE__ */ jsx("input", {
							className: input,
							id: "booking-name",
							value: name,
							onChange: (event) => setName(event.target.value),
							required: true
						})] }),
						/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("label", {
							className: label,
							htmlFor: "booking-email",
							children: "Email"
						}), /* @__PURE__ */ jsx("input", {
							className: input,
							id: "booking-email",
							type: "email",
							value: email,
							onChange: (event) => setEmail(event.target.value),
							required: true
						})] }),
						/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("label", {
							className: label,
							htmlFor: "booking-date",
							children: "Date"
						}), /* @__PURE__ */ jsx("input", {
							className: input,
							id: "booking-date",
							type: "date",
							value: date,
							onChange: (event) => setDate(event.target.value),
							required: true
						})] }),
						/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("label", {
							className: label,
							htmlFor: "booking-time",
							children: "Time"
						}), /* @__PURE__ */ jsx("input", {
							className: input,
							id: "booking-time",
							type: "time",
							value: time,
							onChange: (event) => setTime(event.target.value),
							required: true
						})] }),
						/* @__PURE__ */ jsxs("div", { children: [
							/* @__PURE__ */ jsx("label", {
								className: label,
								htmlFor: "booking-party",
								children: "Party size"
							}),
							/* @__PURE__ */ jsx("input", {
								className: input,
								id: "booking-party",
								type: "number",
								min: 1,
								value: partySize,
								onChange: (event) => setPartySize(event.target.value),
								required: true
							}),
							slot && /* @__PURE__ */ jsx("p", {
								className: `text-xs text-slate-500 mt-1 ${slot.remaining === 0 ? "font-medium text-red-600" : ""}`,
								children: slot.remaining === 0 ? "This time slot is full" : `${slot.remaining} of 20 seats remaining at ${time}`
							})
						] }),
						/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("label", {
							className: label,
							htmlFor: "booking-notes",
							children: "Notes"
						}), /* @__PURE__ */ jsx("input", {
							className: input,
							id: "booking-notes",
							placeholder: "Allergies, occasion, seating…",
							value: notes,
							onChange: (event) => setNotes(event.target.value)
						})] })
					]
				}), /* @__PURE__ */ jsxs("div", {
					className: "flex items-center gap-3",
					children: [/* @__PURE__ */ jsx("button", {
						className: primaryButton,
						type: "submit",
						disabled: busy,
						children: busy ? "Saving…" : editing ? "Save changes" : "Book table"
					}), /* @__PURE__ */ jsx("span", {
						className: smallMuted,
						children: "Each time slot seats at most 20 guests."
					})]
				})]
			})
		]
	});
}
// src/components/MyReservations.tsx
function MyReservations({ reservations, loading, error, onEdit, onRefresh, onUnauthorized }) {
	const [actionError, setActionError] = useState(null);
	async function cancel(reservation) {
		if (!window.confirm(`Cancel your reservation on ${reservation.date} at ${reservation.time}?`)) return;
		setActionError(null);
		try {
			await api(`/api/reservations/${reservation.id}`, { method: "DELETE" });
			onRefresh();
		} catch (cause) {
			if (cause instanceof ApiError && cause.status === 401) {
				onUnauthorized();
				return;
			}
			setActionError(cause instanceof ApiError ? cause.message : "Something went wrong");
		}
	}
	const groups = /* @__PURE__ */ new Map();
	for (const reservation of reservations) {
		const list = groups.get(reservation.date) ?? [];
		list.push(reservation);
		groups.set(reservation.date, list);
	}
	for (const list of groups.values()) list.sort((a, b) => a.time.localeCompare(b.time) || a.id - b.id);
	const dates = [...groups.keys()].sort();
	return /* @__PURE__ */ jsxs("section", {
		className: card,
		"aria-label": "Your reservations",
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "mb-5 flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h2", {
					className: heading,
					children: "Your reservations"
				}), /* @__PURE__ */ jsxs("p", {
					className: smallMuted,
					children: [reservations.length, " upcoming booking(s)"]
				})] }), /* @__PURE__ */ jsx("button", {
					className: secondaryButton,
					type: "button",
					onClick: onRefresh,
					children: "Refresh"
				})]
			}),
			error && /* @__PURE__ */ jsx("p", {
				className: "mb-4 text-sm text-red-700",
				children: error
			}),
			actionError && /* @__PURE__ */ jsx("p", {
				className: "mb-4 text-sm text-red-700",
				children: actionError
			}),
			loading ? /* @__PURE__ */ jsx("p", {
				className: smallMuted,
				children: "Loading reservations…"
			}) : dates.length === 0 ? /* @__PURE__ */ jsxs("div", {
				className: "rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center",
				children: [/* @__PURE__ */ jsx("p", {
					className: "text-sm font-medium text-slate-700",
					children: "You have no reservations yet"
				}), /* @__PURE__ */ jsx("p", {
					className: `${smallMuted} mt-1`,
					children: "Pick a slot or use the booking form to reserve."
				})]
			}) : /* @__PURE__ */ jsx("div", {
				className: "space-y-6",
				children: dates.map((date) => /* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h3", {
					className: "mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500",
					children: formatDay(date)
				}), /* @__PURE__ */ jsx("ul", {
					className: "space-y-3",
					children: groups.get(date).map((reservation) => /* @__PURE__ */ jsx("li", {
						className: "rounded-xl border border-slate-200 bg-slate-50 px-4 py-3",
						children: /* @__PURE__ */ jsxs("div", {
							className: "flex flex-wrap items-start justify-between gap-3",
							children: [/* @__PURE__ */ jsxs("div", {
								className: "space-y-1",
								children: [
									/* @__PURE__ */ jsxs("p", {
										className: "flex flex-wrap items-center gap-2",
										children: [/* @__PURE__ */ jsx("span", {
											className: "text-base font-semibold text-slate-900",
											children: reservation.time
										}), /* @__PURE__ */ jsxs("span", {
											className: "rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800",
											children: [
												reservation.party_size,
												" ",
												reservation.party_size === 1 ? "guest" : "guests"
											]
										})]
									}),
									/* @__PURE__ */ jsxs("p", {
										className: "text-sm text-slate-700",
										children: [
											reservation.name,
											/* @__PURE__ */ jsx("span", {
												className: "text-slate-400",
												children: " · "
											}),
											reservation.email
										]
									}),
									reservation.notes && /* @__PURE__ */ jsx("p", {
										className: "text-sm italic text-slate-500",
										children: reservation.notes
									}),
									/* @__PURE__ */ jsxs("p", {
										className: smallMuted,
										children: [
											"Reservation #",
											reservation.id,
											" · booked",
											" ",
											new Date(reservation.created_at).toLocaleString()
										]
									})
								]
							}), /* @__PURE__ */ jsxs("div", {
								className: "flex shrink-0 gap-2",
								children: [/* @__PURE__ */ jsx("button", {
									className: secondaryButton,
									type: "button",
									onClick: () => onEdit(reservation),
									children: "Edit"
								}), /* @__PURE__ */ jsx("button", {
									className: dangerButton,
									type: "button",
									onClick: () => void cancel(reservation),
									children: "Cancel"
								})]
							})]
						})
					}, reservation.id))
				})] }, date))
			})
		]
	});
}
// src/components/AuthPanel.tsx
function AuthPanel({ onSignedIn }) {
	const [mode, setMode] = useState("signin");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState(null);
	const [notice, setNotice] = useState(null);
	const [busy, setBusy] = useState(false);
	async function submit(event) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		setNotice(null);
		try {
			if (mode === "register") {
				await api("/api/auth/register", {
					method: "POST",
					body: {
						username,
						password
					}
				});
				setMode("signin");
				setNotice("Account created. Sign in to continue.");
			} else {
				const result = await api("/api/auth/login", {
					method: "POST",
					body: {
						username,
						password
					}
				});
				storeSession(username.trim(), result.token);
				setUsername("");
				setPassword("");
				onSignedIn(username.trim());
			}
		} catch (cause) {
			setError(cause instanceof ApiError ? cause.message : "Something went wrong");
		} finally {
			setBusy(false);
		}
	}
	const tabClass = (active) => active ? "rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm" : "rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900";
	return /* @__PURE__ */ jsxs("section", {
		className: `${card} mx-auto w-full max-w-md`,
		"aria-label": "Account",
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "mb-4 flex items-center justify-between gap-4",
				children: [/* @__PURE__ */ jsx("h2", {
					className: heading,
					children: "Account"
				}), /* @__PURE__ */ jsxs("div", {
					className: "flex rounded-lg bg-slate-100 p-1",
					role: "tablist",
					children: [/* @__PURE__ */ jsx("button", {
						className: tabClass(mode === "signin"),
						role: "tab",
						"aria-selected": mode === "signin",
						type: "button",
						onClick: () => {
							setMode("signin");
							setError(null);
							setNotice(null);
						},
						children: "Sign in"
					}), /* @__PURE__ */ jsx("button", {
						className: tabClass(mode === "register"),
						role: "tab",
						"aria-selected": mode === "register",
						type: "button",
						onClick: () => {
							setMode("register");
							setError(null);
							setNotice(null);
						},
						children: "Register"
					})]
				})]
			}),
			notice && /* @__PURE__ */ jsx("p", {
				className: `rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 mb-4`,
				children: notice
			}),
			error && /* @__PURE__ */ jsx("p", {
				className: `rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4`,
				children: error
			}),
			/* @__PURE__ */ jsxs("form", {
				className: "space-y-4",
				onSubmit: submit,
				children: [
					/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("label", {
						className: label,
						htmlFor: "auth-username",
						children: "Username"
					}), /* @__PURE__ */ jsx("input", {
						className: input,
						id: "auth-username",
						autoComplete: "username",
						value: username,
						onChange: (event) => setUsername(event.target.value),
						required: true
					})] }),
					/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("label", {
						className: label,
						htmlFor: "auth-password",
						children: "Password"
					}), /* @__PURE__ */ jsx("input", {
						className: input,
						id: "auth-password",
						type: "password",
						autoComplete: mode === "register" ? "new-password" : "current-password",
						value: password,
						onChange: (event) => setPassword(event.target.value),
						required: true
					})] }),
					/* @__PURE__ */ jsx("button", {
						className: `${primaryButton} w-full`,
						type: "submit",
						disabled: busy,
						children: busy ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"
					})
				]
			})
		]
	});
}
// src/App.tsx
function initialSession() {
	const token = getToken();
	const username = getStoredUsername();
	return token && username ? { username } : null;
}
var activeTabClass = "rounded-lg bg-white px-4 py-2 text-sm font-medium text-indigo-700 shadow-sm ring-1 ring-slate-200";
var inactiveTabClass = "rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900 hover:shadow-sm";
function App() {
	const [session, setSession] = useState(initialSession);
	const [tab, setTab] = useState("availability");
	const [date, setDate] = useState(todayISO);
	const [seed, setSeed] = useState(() => ({
		date,
		time: "",
		nonce: 0
	}));
	const [editing, setEditing] = useState(null);
	const [slots, setSlots] = useState([]);
	const [availabilityLoading, setAvailabilityLoading] = useState(true);
	const [availabilityError, setAvailabilityError] = useState(null);
	const [reservations, setReservations] = useState([]);
	const [reservationsLoading, setReservationsLoading] = useState(false);
	const [reservationsError, setReservationsError] = useState(null);
	const signOut = useCallback(() => {
		clearSession();
		setSession(null);
		setReservations([]);
		setReservationsError(null);
		setEditing(null);
		setTab("availability");
	}, []);
	const refreshAvailability = useCallback(async () => {
		setAvailabilityLoading(true);
		try {
			const result = await api(`/api/availability?date=${encodeURIComponent(date)}`);
			setSlots(result.items);
			setAvailabilityError(null);
		} catch (cause) {
			setAvailabilityError(cause instanceof ApiError ? cause.message : "Could not load availability");
		} finally {
			setAvailabilityLoading(false);
		}
	}, [date]);
	const refreshReservations = useCallback(async () => {
		if (!session) {
			setReservations([]);
			return;
		}
		setReservationsLoading(true);
		try {
			const result = await api("/api/reservations");
			setReservations(result.items);
			setReservationsError(null);
		} catch (cause) {
			if (cause instanceof ApiError && cause.status === 401) {
				signOut();
				return;
			}
			setReservationsError(cause instanceof ApiError ? cause.message : "Could not load reservations");
		} finally {
			setReservationsLoading(false);
		}
	}, [session, signOut]);
	useEffect(() => {
		refreshAvailability();
	}, [refreshAvailability]);
	useEffect(() => {
		refreshReservations();
	}, [refreshReservations]);
	function handleSaved() {
		refreshAvailability();
		refreshReservations();
	}
	function changeDate(next) {
		setDate(next);
		setSeed((previous) => ({
			...previous,
			date: next
		}));
	}
	function handleBook(slot) {
		setSeed((previous) => ({
			date,
			time: slot.time,
			nonce: previous.nonce + 1
		}));
		setEditing(null);
		setTab("book");
	}
	function handleEdit(reservation) {
		setEditing(reservation);
		setTab("book");
	}
	function handleSignedIn(username) {
		setSession({ username });
		setTab("availability");
	}
	const isAdmin = session?.username === "admin";
	const activeTab = session ? tab : "availability";
	const tabs = [{
		id: "availability",
		label: "Availability"
	}];
	if (session) {
		tabs.push({
			id: "book",
			label: "Book a table"
		});
		tabs.push({
			id: "reservations",
			label: "My reservations"
		});
	}
	if (isAdmin) tabs.push({
		id: "admin",
		label: "Admin"
	});
	return /* @__PURE__ */ jsxs("div", {
		className: "min-h-screen bg-slate-50 text-slate-900",
		children: [
			/* @__PURE__ */ jsx("header", {
				className: "border-b border-slate-200 bg-white",
				children: /* @__PURE__ */ jsxs("div", {
					className: "mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4",
					children: [/* @__PURE__ */ jsxs("div", {
						className: "flex items-baseline gap-3",
						children: [/* @__PURE__ */ jsx("h1", {
							className: "text-lg font-semibold tracking-tight",
							children: "Table reservations"
						}), /* @__PURE__ */ jsx("span", {
							className: "hidden text-xs text-slate-400 sm:inline",
							children: "20 seats per time slot"
						})]
					}), session ? /* @__PURE__ */ jsxs("div", {
						className: "flex items-center gap-3",
						children: [/* @__PURE__ */ jsxs("span", {
							className: "text-sm text-slate-600",
							children: [
								"Signed in as",
								" ",
								/* @__PURE__ */ jsx("span", {
									className: "font-semibold text-slate-900",
									children: session.username
								})
							]
						}), /* @__PURE__ */ jsx("button", {
							className: secondaryButton,
							type: "button",
							onClick: signOut,
							children: "Sign out"
						})]
					}) : /* @__PURE__ */ jsx("span", {
						className: smallMuted,
						children: "Sign in to book a table"
					})]
				})
			}),
			/* @__PURE__ */ jsxs("main", {
				className: "mx-auto max-w-5xl px-4 py-8",
				children: [!session && /* @__PURE__ */ jsx(AuthPanel, { onSignedIn: handleSignedIn }), /* @__PURE__ */ jsxs("div", {
					className: "space-y-6",
					children: [
						session && /* @__PURE__ */ jsx("nav", {
							className: "flex flex-wrap gap-2",
							"aria-label": "Sections",
							children: tabs.map((item) => /* @__PURE__ */ jsx("button", {
								"aria-current": item.id === activeTab ? "page" : void 0,
								className: item.id === activeTab ? activeTabClass : inactiveTabClass,
								type: "button",
								onClick: () => setTab(item.id),
								children: item.label
							}, item.id))
						}),
						activeTab === "availability" && /* @__PURE__ */ jsx(AvailabilityPanel, {
							date,
							slots,
							loading: availabilityLoading,
							error: availabilityError,
							signedIn: session !== null,
							onDateChange: changeDate,
							onBook: handleBook
						}),
						session && activeTab === "book" && /* @__PURE__ */ jsx(BookingForm, {
							editing,
							seed,
							slots,
							day: date,
							onSaved: handleSaved,
							onCancelEdit: () => setEditing(null),
							onUnauthorized: signOut
						}),
						session && activeTab === "reservations" && /* @__PURE__ */ jsx(MyReservations, {
							reservations,
							loading: reservationsLoading,
							error: reservationsError,
							onEdit: handleEdit,
							onRefresh: () => void refreshReservations(),
							onUnauthorized: signOut
						}),
						session && isAdmin && activeTab === "admin" && /* @__PURE__ */ jsx(AdminPanel, {
							date,
							onDateChange: changeDate,
							onUnauthorized: signOut
						})
					]
				})]
			}),
			/* @__PURE__ */ jsx("footer", {
				className: "mx-auto max-w-5xl px-4 pb-8",
				children: /* @__PURE__ */ jsx("p", {
					className: smallMuted,
					children: "Anyone can browse a day's availability. Sign in to book, change or cancel your reservations."
				})
			})
		]
	});
}
// smoke-entry.tsx
function render(label, storage) {
	const store = new Map(Object.entries(storage));
	globalThis.localStorage = {
		getItem: (key) => store.get(key) ?? null,
		setItem: (key, value) => void store.set(key, value),
		removeItem: (key) => void store.delete(key)
	};
	const html = renderToString(/* @__PURE__ */ jsx(App, {}));
	if (html.length < 500) throw new Error(`${label}: suspiciously short render (${html.length} chars)`);
	console.log(`${label}: ok (${html.length} chars)`);
	return html;
}
function expect(haystack, needle, label) {
	if (!haystack.includes(needle)) throw new Error(`${label}: missing "${needle}"`);
}
function forbid(haystack, needle, label) {
	if (haystack.includes(needle)) throw new Error(`${label}: must not contain "${needle}"`);
}
var anon = render("anonymous", {});
expect(anon, "Sign in to book a table", "anonymous");
expect(anon, "Availability", "anonymous");
expect(anon, "Loading slots", "anonymous");
forbid(anon, "Book this slot", "anonymous");
forbid(anon, "Book a table", "anonymous");
var user = render("user", {
	"reservations.token": "tok",
	"reservations.username": "bob"
});
expect(user, "Signed in as", "user");
expect(user, "Book a table", "user");
expect(user, "My reservations", "user");
expect(user, "Table reservations", "user");
forbid(user, ">Admin<", "user");
var admin = render("admin", {
	"reservations.token": "tok",
	"reservations.username": "admin"
});
expect(admin, "Signed in as", "admin");
expect(admin, ">Admin<", "admin");
var slots = [{
	time: "18:00",
	booked: 5,
	remaining: 15
}, {
	time: "19:00",
	booked: 20,
	remaining: 0
}];
var panelAnon = renderToString(/* @__PURE__ */ jsx(AvailabilityPanel, {
	date: "2026-12-05",
	slots,
	loading: false,
	error: null,
	signedIn: false,
	onDateChange: () => {},
	onBook: () => {}
}));
expect(panelAnon, "Sign in to book this slot", "panel-anon");
forbid(panelAnon, "Book this slot", "panel-anon");
expect(panelAnon, "0 remaining", "panel-anon");
var panelUser = renderToString(/* @__PURE__ */ jsx(AvailabilityPanel, {
	date: "2026-12-05",
	slots,
	loading: false,
	error: null,
	signedIn: true,
	onDateChange: () => {},
	onBook: () => {}
}));
expect(panelUser, "Book this slot", "panel-user");
expect(panelUser, "5 of 20 booked", "panel-user");
var form = renderToString(/* @__PURE__ */ jsx(BookingForm, {
	editing: null,
	seed: {
		date: "2026-12-05",
		time: "18:00",
		nonce: 1
	},
	slots,
	day: "2026-12-05",
	onSaved: () => {},
	onCancelEdit: () => {}
}));
expect(form, "Book a table", "form");
expect(form, "15 of 20 seats remaining", "form");
var mine = renderToString(/* @__PURE__ */ jsx(MyReservations, {
	reservations: [{
		id: 7,
		name: "Alice Example",
		email: "alice@example.com",
		date: "2026-12-05",
		time: "19:00",
		party_size: 3,
		notes: "Window seat",
		created_at: "2026-11-10T15:21:49+00:00"
	}],
	loading: false,
	error: null,
	onEdit: () => {},
	onRefresh: () => {},
	onUnauthorized: () => {}
}));
expect(mine, "Alice Example", "mine");
expect(mine, "Window seat", "mine");
expect(mine, "Reservation #7", "mine");
expect(mine, "1 upcoming booking(s)", "mine");
expect(renderToString(/* @__PURE__ */ jsx(AdminPanel, {
	date: "2026-12-05",
	onDateChange: () => {},
	onUnauthorized: () => {}
})), "All reservations", "admin-panel");
console.log("SMOKE OK");
export {};
