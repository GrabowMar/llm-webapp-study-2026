import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
// src/router.tsx
function navigate(to) {
	if (to === window.location.pathname + window.location.search) return;
	window.history.pushState({}, "", to);
	window.dispatchEvent(new Event("navigation"));
}
function Link({ to, children, ...rest }) {
	return /* @__PURE__ */ jsx("a", {
		href: to,
		...rest,
		onClick: (event) => {
			event.preventDefault();
			rest.onClick?.(event);
			navigate(to);
		},
		children
	});
}
// src/api.ts
var ApiError = class extends Error {
	status;
	errors;
	constructor(status, message, errors = {}) {
		super(message);
		this.status = status;
		this.errors = errors;
	}
};
function toApiError(err) {
	if (err instanceof ApiError) return err;
	return new ApiError(0, err instanceof Error ? err.message : "Something went wrong");
}
var TOKEN_KEY = "inventory_token";
var USERNAME_KEY = "inventory_username";
function getToken() {
	return localStorage.getItem(TOKEN_KEY);
}
function getUsername() {
	return localStorage.getItem(USERNAME_KEY);
}
function setSession(token, username) {
	localStorage.setItem(TOKEN_KEY, token);
	localStorage.setItem(USERNAME_KEY, username);
	window.dispatchEvent(new Event("session-changed"));
}
function clearSession() {
	localStorage.removeItem(TOKEN_KEY);
	localStorage.removeItem(USERNAME_KEY);
	window.dispatchEvent(new Event("session-changed"));
}
async function apiFetch(path, init = {}) {
	const headers = { Accept: "application/json" };
	if (init.body !== void 0) headers["Content-Type"] = "application/json";
	const token = getToken();
	if (token) headers.Authorization = `Bearer ${token}`;
	let response;
	try {
		response = await fetch(path, {
			method: init.method ?? "GET",
			headers,
			body: init.body !== void 0 ? JSON.stringify(init.body) : void 0
		});
	} catch {
		throw new ApiError(0, "Could not reach the server");
	}
	const text = await response.text();
	let data = null;
	if (text) try {
		data = JSON.parse(text);
	} catch {
		data = null;
	}
	if (!response.ok) {
		const payload = data ?? {};
		const message = payload.error ?? payload.message ?? `Request failed (${response.status})`;
		if (response.status === 401) clearSession();
		throw new ApiError(response.status, message, payload.errors ?? {});
	}
	return data;
}
var api = {
	register(username, password) {
		return apiFetch("/api/auth/register", {
			method: "POST",
			body: {
				username,
				password
			}
		});
	},
	login(username, password) {
		return apiFetch("/api/auth/login", {
			method: "POST",
			body: {
				username,
				password
			}
		});
	},
	listItems(params = {}) {
		const search = new URLSearchParams();
		if (params.q) search.set("q", params.q);
		if (params.location) search.set("location", params.location);
		if (params.low_stock) search.set("low_stock", "1");
		if (params.page) search.set("page", String(params.page));
		if (params.page_size) search.set("page_size", String(params.page_size));
		const qs = search.toString();
		return apiFetch(`/api/items${qs ? `?${qs}` : ""}`);
	},
	getItem(id) {
		return apiFetch(`/api/items/${id}`);
	},
	createItem(body) {
		return apiFetch("/api/items", {
			method: "POST",
			body
		});
	},
	updateItem(id, body) {
		return apiFetch(`/api/items/${id}`, {
			method: "PUT",
			body
		});
	},
	deleteItem(id) {
		return apiFetch(`/api/items/${id}`, { method: "DELETE" });
	},
	listMovements(id) {
		return apiFetch(`/api/items/${id}/movements`);
	},
	createMovement(id, body) {
		return apiFetch(`/api/items/${id}/movements`, {
			method: "POST",
			body
		});
	}
};
// src/components/Header.tsx
function Header({ user, onSignOut }) {
	return /* @__PURE__ */ jsx("header", {
		className: "bg-slate-900 text-white shadow",
		children: /* @__PURE__ */ jsxs("div", {
			className: "mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3",
			children: [/* @__PURE__ */ jsx(Link, {
				to: "/",
				className: "text-lg font-semibold tracking-tight hover:text-sky-300",
				children: "Warehouse Inventory"
			}), /* @__PURE__ */ jsxs("nav", {
				className: "flex items-center gap-3 text-sm",
				children: [/* @__PURE__ */ jsx(Link, {
					to: "/",
					className: "text-slate-200 hover:text-white",
					children: "Inventory"
				}), user ? /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("span", {
					className: "max-w-40 truncate rounded-full bg-slate-700 px-3 py-1 font-medium",
					title: user,
					children: user
				}), /* @__PURE__ */ jsx("button", {
					type: "button",
					onClick: onSignOut,
					className: "rounded bg-sky-600 px-3 py-1.5 font-medium hover:bg-sky-500",
					children: "Sign out"
				})] }) : /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx(Link, {
					to: "/login",
					className: "rounded border border-slate-600 px-3 py-1.5 text-slate-200 hover:border-slate-400 hover:text-white",
					children: "Sign in"
				}), /* @__PURE__ */ jsx(Link, {
					to: "/register",
					className: "rounded bg-sky-600 px-3 py-1.5 font-medium hover:bg-sky-500",
					children: "Register"
				})] })]
			})]
		})
	});
}
// src/pages/InventoryPage.tsx
var PAGE_SIZES = [
	10,
	20,
	50,
	100
];
function InventoryPage({ user }) {
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [location, setLocation] = useState("");
	const [lowOnly, setLowOnly] = useState(false);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [data, setData] = useState(null);
	const [locations, setLocations] = useState([]);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(true);
	const [reload, setReload] = useState(0);
	useEffect(() => {
		const timer = setTimeout(() => setDebouncedQuery(query), 250);
		return () => clearTimeout(timer);
	}, [query]);
	useEffect(() => {
		setPage(1);
	}, [
		debouncedQuery,
		location,
		lowOnly,
		pageSize
	]);
	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		api.listItems({
			q: debouncedQuery || void 0,
			location: location || void 0,
			low_stock: lowOnly,
			page,
			page_size: pageSize
		}).then((result) => {
			if (cancelled) return;
			setData(result);
			setError("");
		}).catch((err) => {
			if (!cancelled) setError(toApiError(err).message);
		}).finally(() => {
			if (!cancelled) setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [
		debouncedQuery,
		location,
		lowOnly,
		page,
		pageSize,
		reload
	]);
	useEffect(() => {
		let cancelled = false;
		api.listItems({ page_size: 1e3 }).then((result) => {
			if (cancelled) return;
			const found = /* @__PURE__ */ new Set();
			for (const item of result.items) if (item.location) found.add(item.location);
			setLocations(Array.from(found).sort((a, b) => a.localeCompare(b)));
		}).catch(() => void 0);
		return () => {
			cancelled = true;
		};
	}, [reload]);
	const remove = async (item) => {
		if (!window.confirm(`Delete "${item.name}" (${item.sku})? Its stock movements will be deleted too.`)) return;
		try {
			await api.deleteItem(item.id);
			setReload((value) => value + 1);
		} catch (err) {
			setError(toApiError(err).message);
		}
	};
	const items = data?.items ?? [];
	const total = data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
	const hasFilters = Boolean(debouncedQuery || location || lowOnly);
	return /* @__PURE__ */ jsxs("div", { children: [
		/* @__PURE__ */ jsxs("div", {
			className: "flex flex-wrap items-center justify-between gap-3",
			children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h1", {
				className: "text-2xl font-semibold",
				children: "Inventory"
			}), /* @__PURE__ */ jsx("p", {
				className: "text-sm text-slate-500",
				children: loading ? "Loading…" : `${total} item${total === 1 ? "" : "s"}`
			})] }), user && /* @__PURE__ */ jsx(Link, {
				to: "/items/new",
				className: "rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500",
				children: "Add item"
			})]
		}),
		!user && /* @__PURE__ */ jsxs("p", {
			className: "mt-3 rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600",
			children: [
				/* @__PURE__ */ jsx(Link, {
					to: "/login",
					className: "font-medium text-sky-700 hover:underline",
					children: "Sign in"
				}),
				" ",
				"to add items and record stock movements."
			]
		}),
		/* @__PURE__ */ jsxs("div", {
			className: "mt-4 flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm",
			children: [
				/* @__PURE__ */ jsxs("div", {
					className: "min-w-48 flex-1",
					children: [/* @__PURE__ */ jsx("label", {
						htmlFor: "search",
						className: "block text-sm font-medium",
						children: "Search"
					}), /* @__PURE__ */ jsx("input", {
						id: "search",
						type: "search",
						placeholder: "Name, SKU or location…",
						value: query,
						onChange: (event) => setQuery(event.target.value),
						className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
					})]
				}),
				/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("label", {
					htmlFor: "location",
					className: "block text-sm font-medium",
					children: "Location"
				}), /* @__PURE__ */ jsxs("select", {
					id: "location",
					value: location,
					onChange: (event) => setLocation(event.target.value),
					className: "mt-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500",
					children: [/* @__PURE__ */ jsx("option", {
						value: "",
						children: "All locations"
					}), locations.map((value) => /* @__PURE__ */ jsx("option", {
						value,
						children: value
					}, value))]
				})] }),
				/* @__PURE__ */ jsxs("div", {
					className: "flex items-center gap-2 pb-2",
					children: [/* @__PURE__ */ jsx("button", {
						type: "button",
						role: "switch",
						"aria-checked": lowOnly,
						"aria-label": "Low stock only",
						onClick: () => setLowOnly((value) => !value),
						className: `relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${lowOnly ? "bg-amber-500" : "bg-slate-300"}`,
						children: /* @__PURE__ */ jsx("span", { className: `inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${lowOnly ? "translate-x-6" : "translate-x-1"}` })
					}), /* @__PURE__ */ jsx("label", {
						className: "cursor-pointer text-sm font-medium select-none",
						onClick: () => setLowOnly((value) => !value),
						children: "Low stock only"
					})]
				})
			]
		}),
		error && /* @__PURE__ */ jsx("div", {
			role: "alert",
			className: "mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700",
			children: error
		}),
		/* @__PURE__ */ jsx("div", {
			className: "mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm",
			children: /* @__PURE__ */ jsxs("table", {
				className: "w-full border-collapse text-sm",
				children: [/* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", {
					className: "border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500",
					children: [
						/* @__PURE__ */ jsx("th", {
							className: "px-4 py-3",
							children: "Name"
						}),
						/* @__PURE__ */ jsx("th", {
							className: "px-4 py-3",
							children: "SKU"
						}),
						/* @__PURE__ */ jsx("th", {
							className: "px-4 py-3",
							children: "Location"
						}),
						/* @__PURE__ */ jsx("th", {
							className: "px-4 py-3 text-right",
							children: "Quantity"
						}),
						/* @__PURE__ */ jsx("th", {
							className: "px-4 py-3 text-right",
							children: "Reorder level"
						}),
						/* @__PURE__ */ jsx("th", {
							className: "px-4 py-3",
							children: "Status"
						}),
						/* @__PURE__ */ jsx("th", {
							className: "px-4 py-3 text-right",
							children: "Actions"
						})
					]
				}) }), /* @__PURE__ */ jsxs("tbody", { children: [
					items.map((item) => /* @__PURE__ */ jsxs("tr", {
						className: `border-b border-slate-100 last:border-0 ${item.low_stock ? "bg-amber-100" : "bg-white hover:bg-slate-50"}`,
						children: [
							/* @__PURE__ */ jsx("td", {
								className: "px-4 py-3",
								children: /* @__PURE__ */ jsx(Link, {
									to: `/items/${item.id}`,
									className: "font-medium text-sky-700 hover:underline",
									children: item.name
								})
							}),
							/* @__PURE__ */ jsx("td", {
								className: "px-4 py-3 font-mono text-xs",
								children: item.sku
							}),
							/* @__PURE__ */ jsx("td", {
								className: "px-4 py-3",
								children: item.location || "—"
							}),
							/* @__PURE__ */ jsx("td", {
								className: "px-4 py-3 text-right font-semibold",
								children: item.quantity
							}),
							/* @__PURE__ */ jsx("td", {
								className: "px-4 py-3 text-right text-slate-600",
								children: item.reorder_level
							}),
							/* @__PURE__ */ jsx("td", {
								className: "px-4 py-3",
								children: item.low_stock ? /* @__PURE__ */ jsx("span", {
									className: "inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700",
									children: "Low stock"
								}) : /* @__PURE__ */ jsx("span", {
									className: "inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700",
									children: "OK"
								})
							}),
							/* @__PURE__ */ jsxs("td", {
								className: "px-4 py-3 text-right whitespace-nowrap",
								children: [/* @__PURE__ */ jsx(Link, {
									to: `/items/${item.id}`,
									className: "text-sky-700 hover:underline",
									children: "View"
								}), user && /* @__PURE__ */ jsxs(Fragment, { children: [
									/* @__PURE__ */ jsx("span", {
										className: "mx-2 text-slate-300",
										children: "|"
									}),
									/* @__PURE__ */ jsx(Link, {
										to: `/items/${item.id}/edit`,
										className: "text-sky-700 hover:underline",
										children: "Edit"
									}),
									/* @__PURE__ */ jsx("span", {
										className: "mx-2 text-slate-300",
										children: "|"
									}),
									/* @__PURE__ */ jsx("button", {
										type: "button",
										onClick: () => remove(item),
										className: "text-red-600 hover:underline",
										children: "Delete"
									})
								] })]
							})
						]
					}, item.id)),
					!loading && items.length === 0 && /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", {
						colSpan: 7,
						className: "px-4 py-8 text-center text-slate-500",
						children: hasFilters ? "No items match your filters." : "No items yet."
					}) }),
					loading && /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", {
						colSpan: 7,
						className: "px-4 py-8 text-center text-slate-500",
						children: "Loading items…"
					}) })
				] })]
			})
		}),
		/* @__PURE__ */ jsxs("div", {
			className: "mt-4 flex flex-wrap items-center justify-between gap-3",
			children: [/* @__PURE__ */ jsxs("div", {
				className: "flex items-center gap-2 text-sm",
				children: [/* @__PURE__ */ jsx("label", {
					htmlFor: "page-size",
					children: "Rows per page"
				}), /* @__PURE__ */ jsx("select", {
					id: "page-size",
					value: pageSize,
					onChange: (event) => setPageSize(Number(event.target.value)),
					className: "rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none",
					children: PAGE_SIZES.map((size) => /* @__PURE__ */ jsx("option", {
						value: size,
						children: size
					}, size))
				})]
			}), /* @__PURE__ */ jsxs("div", {
				className: "flex items-center gap-3 text-sm",
				children: [
					/* @__PURE__ */ jsx("button", {
						type: "button",
						onClick: () => setPage((value) => Math.max(1, value - 1)),
						disabled: page <= 1,
						className: "rounded border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
						children: "Previous"
					}),
					/* @__PURE__ */ jsxs("span", {
						className: "text-slate-600",
						children: [
							"Page ",
							page,
							" of ",
							totalPages
						]
					}),
					/* @__PURE__ */ jsx("button", {
						type: "button",
						onClick: () => setPage((value) => Math.min(totalPages, value + 1)),
						disabled: page >= totalPages,
						className: "rounded border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
						children: "Next"
					})
				]
			})]
		})
	] });
}
// src/pages/ItemDetailPage.tsx
function formatDate(value) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
function ItemDetailPage({ id, user }) {
	const [item, setItem] = useState(null);
	const [movements, setMovements] = useState([]);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(true);
	const [receiveQty, setReceiveQty] = useState("");
	const [receiveReason, setReceiveReason] = useState("");
	const [takeQty, setTakeQty] = useState("");
	const [takeReason, setTakeReason] = useState("");
	const [receiveError, setReceiveError] = useState("");
	const [takeError, setTakeError] = useState("");
	const [busy, setBusy] = useState(false);
	const refresh = useCallback(async () => {
		const [nextItem, nextMovements] = await Promise.all([api.getItem(id), api.listMovements(id)]);
		setItem(nextItem);
		setMovements(nextMovements.items);
		return nextItem;
	}, [id]);
	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		refresh().then(() => {
			if (!cancelled) setError("");
		}).catch((err) => {
			if (!cancelled) setError(toApiError(err).message);
		}).finally(() => {
			if (!cancelled) setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [refresh]);
	const record = async (sign) => {
		const amountText = sign === 1 ? receiveQty : takeQty;
		const reason = (sign === 1 ? receiveReason : takeReason).trim();
		const setAmountError = sign === 1 ? setReceiveError : setTakeError;
		setAmountError("");
		const amount = Number(amountText);
		if (!amountText || !Number.isInteger(amount) || amount <= 0) {
			setAmountError("Enter a whole number greater than zero.");
			return;
		}
		setBusy(true);
		try {
			await api.createMovement(id, {
				delta: sign * amount,
				reason
			});
			await refresh();
			if (sign === 1) {
				setReceiveQty("");
				setReceiveReason("");
			} else {
				setTakeQty("");
				setTakeReason("");
			}
		} catch (err) {
			setAmountError(toApiError(err).message);
		} finally {
			setBusy(false);
		}
	};
	const submitReceive = (event) => {
		event.preventDefault();
		record(1);
	};
	const submitTake = (event) => {
		event.preventDefault();
		record(-1);
	};
	const remove = async () => {
		if (!item) return;
		if (!window.confirm(`Delete "${item.name}" (${item.sku})? Its stock movements will be deleted too.`)) return;
		try {
			await api.deleteItem(item.id);
			navigate("/");
		} catch (err) {
			setError(toApiError(err).message);
		}
	};
	if (loading && !item) return /* @__PURE__ */ jsx("p", {
		className: "text-slate-500",
		children: "Loading item…"
	});
	if (!item) return /* @__PURE__ */ jsxs("div", {
		className: "rounded-lg border border-slate-200 bg-white p-8 text-center",
		children: [/* @__PURE__ */ jsx("p", {
			className: "font-semibold",
			children: error || "Item not found"
		}), /* @__PURE__ */ jsx(Link, {
			to: "/",
			className: "mt-3 inline-block text-sky-700 hover:underline",
			children: "Back to inventory"
		})]
	});
	return /* @__PURE__ */ jsxs("div", { children: [
		/* @__PURE__ */ jsx(Link, {
			to: "/",
			className: "text-sm text-sky-700 hover:underline",
			children: "← Back to inventory"
		}),
		error && /* @__PURE__ */ jsx("div", {
			role: "alert",
			className: "mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700",
			children: error
		}),
		/* @__PURE__ */ jsxs("div", {
			className: "mt-3 rounded-lg border border-slate-200 bg-white p-6 shadow-sm",
			children: [
				/* @__PURE__ */ jsxs("div", {
					className: "flex flex-wrap items-start justify-between gap-4",
					children: [/* @__PURE__ */ jsxs("div", { children: [
						/* @__PURE__ */ jsx("h1", {
							className: "text-2xl font-semibold",
							children: item.name
						}),
						/* @__PURE__ */ jsx("p", {
							className: "mt-1 font-mono text-sm text-slate-600",
							children: item.sku
						}),
						/* @__PURE__ */ jsxs("p", {
							className: "text-sm text-slate-600",
							children: ["Location: ", item.location || "—"]
						})
					] }), /* @__PURE__ */ jsxs("div", {
						className: "text-right",
						children: [
							/* @__PURE__ */ jsxs("p", {
								className: "text-3xl font-bold",
								children: [item.quantity, /* @__PURE__ */ jsx("span", {
									className: "ml-1 text-sm font-normal text-slate-500",
									children: "in stock"
								})]
							}),
							/* @__PURE__ */ jsxs("p", {
								className: "text-sm text-slate-600",
								children: ["Reorder level: ", item.reorder_level]
							}),
							/* @__PURE__ */ jsx("span", {
								className: `mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${item.low_stock ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`,
								children: item.low_stock ? "Low stock" : "OK"
							})
						]
					})]
				}),
				user && /* @__PURE__ */ jsxs("div", {
					className: "mt-6 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2",
					children: [/* @__PURE__ */ jsxs("form", {
						onSubmit: submitReceive,
						className: "rounded-lg border border-emerald-200 bg-emerald-50 p-4",
						children: [
							/* @__PURE__ */ jsx("h2", {
								className: "font-semibold text-emerald-800",
								children: "Receive stock"
							}),
							/* @__PURE__ */ jsx("label", {
								htmlFor: "receive-qty",
								className: "mt-2 block text-sm font-medium",
								children: "Quantity"
							}),
							/* @__PURE__ */ jsx("input", {
								id: "receive-qty",
								type: "number",
								min: 1,
								step: 1,
								value: receiveQty,
								onChange: (event) => setReceiveQty(event.target.value),
								className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
							}),
							/* @__PURE__ */ jsx("label", {
								htmlFor: "receive-reason",
								className: "mt-2 block text-sm font-medium",
								children: "Reason"
							}),
							/* @__PURE__ */ jsx("input", {
								id: "receive-reason",
								type: "text",
								placeholder: "e.g. delivery",
								value: receiveReason,
								onChange: (event) => setReceiveReason(event.target.value),
								className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
							}),
							receiveError && /* @__PURE__ */ jsx("p", {
								className: "mt-2 text-sm text-red-600",
								children: receiveError
							}),
							/* @__PURE__ */ jsx("button", {
								type: "submit",
								disabled: busy,
								className: "mt-3 w-full rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60",
								children: "Receive"
							})
						]
					}), /* @__PURE__ */ jsxs("form", {
						onSubmit: submitTake,
						className: "rounded-lg border border-sky-200 bg-sky-50 p-4",
						children: [
							/* @__PURE__ */ jsx("h2", {
								className: "font-semibold text-sky-800",
								children: "Take out stock"
							}),
							/* @__PURE__ */ jsx("label", {
								htmlFor: "take-qty",
								className: "mt-2 block text-sm font-medium",
								children: "Quantity"
							}),
							/* @__PURE__ */ jsx("input", {
								id: "take-qty",
								type: "number",
								min: 1,
								step: 1,
								value: takeQty,
								onChange: (event) => setTakeQty(event.target.value),
								className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
							}),
							/* @__PURE__ */ jsx("label", {
								htmlFor: "take-reason",
								className: "mt-2 block text-sm font-medium",
								children: "Reason"
							}),
							/* @__PURE__ */ jsx("input", {
								id: "take-reason",
								type: "text",
								placeholder: "e.g. order #123",
								value: takeReason,
								onChange: (event) => setTakeReason(event.target.value),
								className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
							}),
							takeError && /* @__PURE__ */ jsx("p", {
								className: "mt-2 text-sm text-red-600",
								children: takeError
							}),
							/* @__PURE__ */ jsx("button", {
								type: "submit",
								disabled: busy,
								className: "mt-3 w-full rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60",
								children: "Take out"
							})
						]
					})]
				}),
				!user && /* @__PURE__ */ jsxs("p", {
					className: "mt-4 border-t border-slate-200 pt-4 text-sm text-slate-600",
					children: [
						/* @__PURE__ */ jsx(Link, {
							to: "/login",
							className: "font-medium text-sky-700 hover:underline",
							children: "Sign in"
						}),
						" ",
						"to receive or take out stock."
					]
				}),
				user && /* @__PURE__ */ jsxs("div", {
					className: "mt-4 flex gap-3 border-t border-slate-200 pt-4",
					children: [/* @__PURE__ */ jsx(Link, {
						to: `/items/${item.id}/edit`,
						className: "rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50",
						children: "Edit item"
					}), /* @__PURE__ */ jsx("button", {
						type: "button",
						onClick: remove,
						className: "rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500",
						children: "Delete item"
					})]
				})
			]
		}),
		/* @__PURE__ */ jsxs("div", {
			className: "mt-6",
			children: [/* @__PURE__ */ jsx("h2", {
				className: "text-lg font-semibold",
				children: "Stock movements"
			}), /* @__PURE__ */ jsx("div", {
				className: "mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm",
				children: /* @__PURE__ */ jsxs("table", {
					className: "w-full border-collapse text-sm",
					children: [/* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", {
						className: "border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500",
						children: [
							/* @__PURE__ */ jsx("th", {
								className: "px-4 py-3",
								children: "Date"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "px-4 py-3 text-right",
								children: "Delta"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "px-4 py-3",
								children: "Reason"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "px-4 py-3 text-right",
								children: "Quantity after"
							}),
							/* @__PURE__ */ jsx("th", {
								className: "px-4 py-3",
								children: "User"
							})
						]
					}) }), /* @__PURE__ */ jsxs("tbody", { children: [movements.map((movement) => /* @__PURE__ */ jsxs("tr", {
						className: "border-b border-slate-100 last:border-0",
						children: [
							/* @__PURE__ */ jsx("td", {
								className: "px-4 py-3 whitespace-nowrap text-slate-600",
								children: formatDate(movement.created_at)
							}),
							/* @__PURE__ */ jsx("td", {
								className: `px-4 py-3 text-right font-semibold ${movement.delta > 0 ? "text-emerald-700" : "text-red-600"}`,
								children: movement.delta > 0 ? `+${movement.delta}` : movement.delta
							}),
							/* @__PURE__ */ jsx("td", {
								className: "px-4 py-3",
								children: movement.reason || "—"
							}),
							/* @__PURE__ */ jsx("td", {
								className: "px-4 py-3 text-right font-semibold",
								children: movement.quantity_after
							}),
							/* @__PURE__ */ jsx("td", {
								className: "px-4 py-3",
								children: movement.username
							})
						]
					}, movement.id)), movements.length === 0 && /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", {
						colSpan: 5,
						className: "px-4 py-6 text-center text-slate-500",
						children: "No movements recorded yet."
					}) })] })]
				})
			})]
		})
	] });
}
// src/pages/ItemFormPage.tsx
function ItemFormPage({ mode, id, user }) {
	const isEdit = mode === "edit";
	const [name, setName] = useState("");
	const [sku, setSku] = useState("");
	const [location, setLocation] = useState("");
	const [reorderLevel, setReorderLevel] = useState("0");
	const [quantity, setQuantity] = useState("0");
	const [currentQuantity, setCurrentQuantity] = useState(null);
	const [error, setError] = useState(null);
	const [fieldErrors, setFieldErrors] = useState({});
	const [loading, setLoading] = useState(isEdit);
	const [busy, setBusy] = useState(false);
	useEffect(() => {
		if (!isEdit || !id) return;
		let cancelled = false;
		api.getItem(id).then((item) => {
			if (cancelled) return;
			setName(item.name);
			setSku(item.sku);
			setLocation(item.location);
			setReorderLevel(String(item.reorder_level));
			setCurrentQuantity(item.quantity);
			setError(null);
			setFieldErrors({});
		}).catch((err) => {
			if (!cancelled) setError(toApiError(err).message);
		}).finally(() => {
			if (!cancelled) setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [isEdit, id]);
	const submit = async (event) => {
		event.preventDefault();
		setBusy(true);
		setError(null);
		setFieldErrors({});
		try {
			const body = {
				name,
				sku,
				location,
				reorder_level: Number(reorderLevel) || 0,
				...isEdit ? {} : { quantity: Number(quantity) || 0 }
			};
			navigate(`/items/${(isEdit && id ? await api.updateItem(id, body) : await api.createItem(body)).id}`);
		} catch (err) {
			const apiError = toApiError(err);
			setError(apiError.message);
			setFieldErrors(apiError.errors);
		} finally {
			setBusy(false);
		}
	};
	if (!user) return /* @__PURE__ */ jsxs("div", {
		className: "mx-auto max-w-lg rounded-lg border border-slate-200 bg-white p-8 text-center",
		children: [
			/* @__PURE__ */ jsx("p", {
				className: "font-semibold",
				children: "Sign in required"
			}),
			/* @__PURE__ */ jsxs("p", {
				className: "mt-1 text-sm text-slate-600",
				children: [isEdit ? "Editing items" : "Adding items", " needs a signed-in account."]
			}),
			/* @__PURE__ */ jsx(Link, {
				to: "/login",
				className: "mt-4 inline-block rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500",
				children: "Sign in"
			})
		]
	});
	if (loading) return /* @__PURE__ */ jsx("p", {
		className: "text-slate-500",
		children: "Loading item…"
	});
	return /* @__PURE__ */ jsxs("div", {
		className: "mx-auto max-w-lg",
		children: [/* @__PURE__ */ jsxs(Link, {
			to: isEdit && id ? `/items/${id}` : "/",
			className: "text-sm text-sky-700 hover:underline",
			children: ["← ", isEdit ? "Back to item" : "Back to inventory"]
		}), /* @__PURE__ */ jsxs("div", {
			className: "mt-3 rounded-lg border border-slate-200 bg-white p-6 shadow-sm",
			children: [
				/* @__PURE__ */ jsx("h1", {
					className: "text-xl font-semibold",
					children: isEdit ? "Edit item" : "Add item"
				}),
				error && /* @__PURE__ */ jsx("div", {
					role: "alert",
					className: "mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700",
					children: error
				}),
				/* @__PURE__ */ jsxs("form", {
					onSubmit: submit,
					className: "mt-4 space-y-4",
					children: [
						/* @__PURE__ */ jsxs("div", { children: [
							/* @__PURE__ */ jsx("label", {
								htmlFor: "name",
								className: "block text-sm font-medium",
								children: "Name"
							}),
							/* @__PURE__ */ jsx("input", {
								id: "name",
								type: "text",
								value: name,
								onChange: (event) => setName(event.target.value),
								className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
							}),
							fieldErrors.name && /* @__PURE__ */ jsx("p", {
								className: "mt-1 text-sm text-red-600",
								children: fieldErrors.name
							})
						] }),
						/* @__PURE__ */ jsxs("div", { children: [
							/* @__PURE__ */ jsx("label", {
								htmlFor: "sku",
								className: "block text-sm font-medium",
								children: "SKU"
							}),
							/* @__PURE__ */ jsx("input", {
								id: "sku",
								type: "text",
								value: sku,
								onChange: (event) => setSku(event.target.value),
								className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
							}),
							fieldErrors.sku && /* @__PURE__ */ jsx("p", {
								className: "mt-1 text-sm text-red-600",
								children: fieldErrors.sku
							})
						] }),
						/* @__PURE__ */ jsxs("div", { children: [
							/* @__PURE__ */ jsx("label", {
								htmlFor: "item-location",
								className: "block text-sm font-medium",
								children: "Location"
							}),
							/* @__PURE__ */ jsx("input", {
								id: "item-location",
								type: "text",
								value: location,
								onChange: (event) => setLocation(event.target.value),
								className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
							}),
							fieldErrors.location && /* @__PURE__ */ jsx("p", {
								className: "mt-1 text-sm text-red-600",
								children: fieldErrors.location
							})
						] }),
						/* @__PURE__ */ jsxs("div", { children: [
							/* @__PURE__ */ jsx("label", {
								htmlFor: "reorder",
								className: "block text-sm font-medium",
								children: "Reorder level"
							}),
							/* @__PURE__ */ jsx("input", {
								id: "reorder",
								type: "number",
								min: 0,
								step: 1,
								value: reorderLevel,
								onChange: (event) => setReorderLevel(event.target.value),
								className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
							}),
							fieldErrors.reorder_level && /* @__PURE__ */ jsx("p", {
								className: "mt-1 text-sm text-red-600",
								children: fieldErrors.reorder_level
							})
						] }),
						isEdit ? /* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("span", {
							className: "block text-sm font-medium",
							children: "Quantity"
						}), /* @__PURE__ */ jsxs("p", {
							className: "mt-1 rounded bg-slate-100 px-3 py-2 text-sm text-slate-700",
							children: [currentQuantity ?? "—", " — quantity changes only through stock movements."]
						})] }) : /* @__PURE__ */ jsxs("div", { children: [
							/* @__PURE__ */ jsx("label", {
								htmlFor: "quantity",
								className: "block text-sm font-medium",
								children: "Opening quantity"
							}),
							/* @__PURE__ */ jsx("input", {
								id: "quantity",
								type: "number",
								min: 0,
								step: 1,
								value: quantity,
								onChange: (event) => setQuantity(event.target.value),
								className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
							}),
							fieldErrors.quantity && /* @__PURE__ */ jsx("p", {
								className: "mt-1 text-sm text-red-600",
								children: fieldErrors.quantity
							})
						] }),
						/* @__PURE__ */ jsxs("div", {
							className: "flex gap-3 pt-1",
							children: [/* @__PURE__ */ jsx("button", {
								type: "submit",
								disabled: busy,
								className: "rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60",
								children: busy ? "Saving…" : isEdit ? "Save changes" : "Add item"
							}), /* @__PURE__ */ jsx(Link, {
								to: isEdit && id ? `/items/${id}` : "/",
								className: "rounded border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50",
								children: "Cancel"
							})]
						})
					]
				})
			]
		})]
	});
}
// src/pages/AuthPage.tsx
function AuthPage({ mode, user, onSignIn }) {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState(null);
	const [fieldErrors, setFieldErrors] = useState({});
	const [busy, setBusy] = useState(false);
	useEffect(() => {
		if (user) navigate("/");
	}, [user]);
	const isRegister = mode === "register";
	const submit = async (event) => {
		event.preventDefault();
		setBusy(true);
		setError(null);
		setFieldErrors({});
		try {
			if (isRegister) await api.register(username, password);
			const { token } = await api.login(username, password);
			onSignIn(token, username);
			navigate("/");
		} catch (err) {
			const apiError = toApiError(err);
			setError(apiError.message);
			setFieldErrors(apiError.errors);
		} finally {
			setBusy(false);
		}
	};
	return /* @__PURE__ */ jsx("div", {
		className: "mx-auto max-w-md",
		children: /* @__PURE__ */ jsxs("div", {
			className: "rounded-lg border border-slate-200 bg-white p-6 shadow-sm",
			children: [
				/* @__PURE__ */ jsx("h1", {
					className: "text-xl font-semibold",
					children: isRegister ? "Create an account" : "Sign in"
				}),
				/* @__PURE__ */ jsx("p", {
					className: "mt-1 text-sm text-slate-500",
					children: isRegister ? "Register to add items and record stock movements." : "Sign in to manage items and record stock movements."
				}),
				error && /* @__PURE__ */ jsx("div", {
					role: "alert",
					className: "mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700",
					children: error
				}),
				/* @__PURE__ */ jsxs("form", {
					onSubmit: submit,
					className: "mt-4 space-y-4",
					children: [
						/* @__PURE__ */ jsxs("div", { children: [
							/* @__PURE__ */ jsx("label", {
								htmlFor: "username",
								className: "block text-sm font-medium",
								children: "Username"
							}),
							/* @__PURE__ */ jsx("input", {
								id: "username",
								name: "username",
								type: "text",
								autoComplete: "username",
								value: username,
								onChange: (event) => setUsername(event.target.value),
								className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
							}),
							fieldErrors.username && /* @__PURE__ */ jsx("p", {
								className: "mt-1 text-sm text-red-600",
								children: fieldErrors.username
							})
						] }),
						/* @__PURE__ */ jsxs("div", { children: [
							/* @__PURE__ */ jsx("label", {
								htmlFor: "password",
								className: "block text-sm font-medium",
								children: "Password"
							}),
							/* @__PURE__ */ jsx("input", {
								id: "password",
								name: "password",
								type: "password",
								autoComplete: isRegister ? "new-password" : "current-password",
								value: password,
								onChange: (event) => setPassword(event.target.value),
								className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
							}),
							fieldErrors.password && /* @__PURE__ */ jsx("p", {
								className: "mt-1 text-sm text-red-600",
								children: fieldErrors.password
							})
						] }),
						/* @__PURE__ */ jsx("button", {
							type: "submit",
							disabled: busy,
							className: "w-full rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60",
							children: busy ? "Please wait…" : isRegister ? "Register" : "Sign in"
						})
					]
				}),
				/* @__PURE__ */ jsx("p", {
					className: "mt-4 text-sm text-slate-600",
					children: isRegister ? /* @__PURE__ */ jsxs(Fragment, { children: [
						"Already have an account?",
						" ",
						/* @__PURE__ */ jsx(Link, {
							to: "/login",
							className: "text-sky-700 hover:underline",
							children: "Sign in"
						})
					] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
						"Need an account?",
						" ",
						/* @__PURE__ */ jsx(Link, {
							to: "/register",
							className: "text-sky-700 hover:underline",
							children: "Register"
						})
					] })
				})
			]
		})
	});
}
// src/App.tsx
function parseRoute(pathname) {
	const parts = pathname.split("/").filter(Boolean);
	if (parts.length === 0) return { name: "list" };
	if (parts[0] === "login" && parts.length === 1) return { name: "login" };
	if (parts[0] === "register" && parts.length === 1) return { name: "register" };
	if (parts[0] === "items") {
		if (parts.length === 1) return { name: "list" };
		if (parts[1] === "new" && parts.length === 2) return { name: "newItem" };
		const id = Number(parts[2]);
		if (parts.length === 3 && Number.isInteger(id) && id > 0) return {
			name: "item",
			id
		};
		if (parts.length === 4 && parts[3] === "edit") {
			const editId = Number(parts[2]);
			if (Number.isInteger(editId) && editId > 0) return {
				name: "editItem",
				id: editId
			};
		}
	}
	return { name: "notFound" };
}
function App() {
	const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
	const [user, setUser] = useState(() => getToken() ? getUsername() : null);
	useEffect(() => {
		const sync = () => setRoute(parseRoute(window.location.pathname));
		const session = () => setUser(getToken() ? getUsername() : null);
		window.addEventListener("popstate", sync);
		window.addEventListener("navigation", sync);
		window.addEventListener("session-changed", session);
		return () => {
			window.removeEventListener("popstate", sync);
			window.removeEventListener("navigation", sync);
			window.removeEventListener("session-changed", session);
		};
	}, []);
	const signIn = (token, username) => {
		setSession(token, username);
		setUser(username);
	};
	const signOut = () => {
		clearSession();
		setUser(null);
		navigate("/");
	};
	let page;
	switch (route.name) {
		case "list":
			page = /* @__PURE__ */ jsx(InventoryPage, { user });
			break;
		case "login":
			page = /* @__PURE__ */ jsx(AuthPage, {
				mode: "login",
				user,
				onSignIn: signIn
			});
			break;
		case "register":
			page = /* @__PURE__ */ jsx(AuthPage, {
				mode: "register",
				user,
				onSignIn: signIn
			});
			break;
		case "newItem":
			page = /* @__PURE__ */ jsx(ItemFormPage, {
				mode: "create",
				user
			});
			break;
		case "item":
			page = /* @__PURE__ */ jsx(ItemDetailPage, {
				id: route.id,
				user
			});
			break;
		case "editItem":
			page = /* @__PURE__ */ jsx(ItemFormPage, {
				mode: "edit",
				id: route.id,
				user
			});
			break;
		default: page = /* @__PURE__ */ jsxs("div", {
			className: "rounded-lg border border-slate-200 bg-white p-8 text-center",
			children: [/* @__PURE__ */ jsx("p", {
				className: "text-lg font-semibold",
				children: "Page not found"
			}), /* @__PURE__ */ jsx(Link, {
				to: "/",
				className: "mt-3 inline-block text-sky-700 hover:underline",
				children: "Back to inventory"
			})]
		});
	}
	return /* @__PURE__ */ jsxs("div", {
		className: "min-h-screen bg-slate-100 text-slate-900",
		children: [/* @__PURE__ */ jsx(Header, {
			user,
			onSignOut: signOut
		}), /* @__PURE__ */ jsx("main", {
			className: "mx-auto w-full max-w-5xl px-4 py-6",
			children: page
		})]
	});
}
// src/smoke-entry.tsx
function mount(container) {
	createRoot(container).render(/* @__PURE__ */ jsx(App, {}));
}
export { mount };
