import { jsx, jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
// src/api.ts
var ApiError = class extends Error {
	status;
	constructor(message, status) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
};
var SESSION_KEY = "gallery.session";
function loadSession() {
	try {
		const raw = localStorage.getItem(SESSION_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed.token === "string" && typeof parsed.username === "string") return {
			token: parsed.token,
			username: parsed.username
		};
		return null;
	} catch {
		return null;
	}
}
function saveSession(session) {
	if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
	else localStorage.removeItem(SESSION_KEY);
}
async function errorFromResponse(response) {
	try {
		const body = await response.json();
		if (body && typeof body.error === "string" && body.error) return body.error;
	} catch {}
	return `Request failed with status ${response.status}`;
}
async function request(path, options = {}, session) {
	const headers = new Headers(options.headers);
	if (options.body) headers.set("Content-Type", "application/json");
	if (session) headers.set("Authorization", `Bearer ${session.token}`);
	const response = await fetch(path, {
		...options,
		headers
	});
	if (!response.ok) throw new ApiError(await errorFromResponse(response), response.status);
	if (response.status === 204) return;
	return await response.json();
}
async function register(username, password) {
	await request("/api/auth/register", {
		method: "POST",
		body: JSON.stringify({
			username,
			password
		})
	});
}
async function login(username, password) {
	return {
		token: (await request("/api/auth/login", {
			method: "POST",
			body: JSON.stringify({
				username,
				password
			})
		})).token,
		username
	};
}
async function listImages(page, pageSize) {
	return request(`/api/images?${new URLSearchParams({
		page: String(page),
		page_size: String(pageSize)
	}).toString()}`);
}
async function createImage(image, session) {
	return request("/api/images", {
		method: "POST",
		body: JSON.stringify(image)
	}, session);
}
async function deleteImage(id, session) {
	await request(`/api/images/${id}`, { method: "DELETE" }, session);
}
function formatBytes(bytes) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1048576).toFixed(1)} MB`;
}
function formatShortDate(iso) {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleDateString(void 0, {
		year: "numeric",
		month: "short",
		day: "numeric"
	});
}
function formatFullDate(iso) {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleString();
}
// src/components/AuthForms.tsx
var inputClass$1 = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200";
var buttonClass = "w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";
function ErrorBanner({ message }) {
	return /* @__PURE__ */ jsx("p", {
		role: "alert",
		className: "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700",
		children: message
	});
}
function AuthForms({ onAuthed }) {
	const [regUsername, setRegUsername] = useState("");
	const [regPassword, setRegPassword] = useState("");
	const [regError, setRegError] = useState(null);
	const [regBusy, setRegBusy] = useState(false);
	const [loginUsername, setLoginUsername] = useState("");
	const [loginPassword, setLoginPassword] = useState("");
	const [loginError, setLoginError] = useState(null);
	const [loginBusy, setLoginBusy] = useState(false);
	const handleRegister = async (event) => {
		event.preventDefault();
		setRegError(null);
		if (!regUsername.trim() || !regPassword) {
			setRegError("Enter a username and a password.");
			return;
		}
		setRegBusy(true);
		try {
			await register(regUsername.trim(), regPassword);
			onAuthed(await login(regUsername.trim(), regPassword));
		} catch (err) {
			setRegError(err instanceof ApiError ? err.message : "Registration failed.");
		} finally {
			setRegBusy(false);
		}
	};
	const handleLogin = async (event) => {
		event.preventDefault();
		setLoginError(null);
		if (!loginUsername.trim() || !loginPassword) {
			setLoginError("Enter a username and a password.");
			return;
		}
		setLoginBusy(true);
		try {
			onAuthed(await login(loginUsername.trim(), loginPassword));
		} catch (err) {
			setLoginError(err instanceof ApiError ? err.message : "Sign in failed.");
		} finally {
			setLoginBusy(false);
		}
	};
	return /* @__PURE__ */ jsxs("section", {
		className: "grid gap-4 md:grid-cols-2",
		"aria-label": "Account",
		children: [/* @__PURE__ */ jsxs("form", {
			onSubmit: handleRegister,
			className: "space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm",
			children: [
				/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h2", {
					className: "text-base font-semibold text-slate-900",
					children: "Create account"
				}), /* @__PURE__ */ jsx("p", {
					className: "mt-1 text-sm text-slate-500",
					children: "Register to upload and delete images."
				})] }),
				regError && /* @__PURE__ */ jsx(ErrorBanner, { message: regError }),
				/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("label", {
					htmlFor: "register-username",
					className: "block text-sm font-medium text-slate-700",
					children: "Username"
				}), /* @__PURE__ */ jsx("input", {
					id: "register-username",
					name: "username",
					type: "text",
					autoComplete: "username",
					value: regUsername,
					onChange: (e) => setRegUsername(e.target.value),
					className: inputClass$1,
					required: true
				})] }),
				/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("label", {
					htmlFor: "register-password",
					className: "block text-sm font-medium text-slate-700",
					children: "Password"
				}), /* @__PURE__ */ jsx("input", {
					id: "register-password",
					name: "password",
					type: "password",
					autoComplete: "new-password",
					value: regPassword,
					onChange: (e) => setRegPassword(e.target.value),
					className: inputClass$1,
					required: true
				})] }),
				/* @__PURE__ */ jsx("button", {
					type: "submit",
					disabled: regBusy,
					className: buttonClass,
					children: regBusy ? "Creating account..." : "Register"
				})
			]
		}), /* @__PURE__ */ jsxs("form", {
			onSubmit: handleLogin,
			className: "space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm",
			children: [
				/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h2", {
					className: "text-base font-semibold text-slate-900",
					children: "Sign in"
				}), /* @__PURE__ */ jsx("p", {
					className: "mt-1 text-sm text-slate-500",
					children: "Sign in to upload images."
				})] }),
				loginError && /* @__PURE__ */ jsx(ErrorBanner, { message: loginError }),
				/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("label", {
					htmlFor: "login-username",
					className: "block text-sm font-medium text-slate-700",
					children: "Username"
				}), /* @__PURE__ */ jsx("input", {
					id: "login-username",
					name: "username",
					type: "text",
					autoComplete: "username",
					value: loginUsername,
					onChange: (e) => setLoginUsername(e.target.value),
					className: inputClass$1,
					required: true
				})] }),
				/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("label", {
					htmlFor: "login-password",
					className: "block text-sm font-medium text-slate-700",
					children: "Password"
				}), /* @__PURE__ */ jsx("input", {
					id: "login-password",
					name: "password",
					type: "password",
					autoComplete: "current-password",
					value: loginPassword,
					onChange: (e) => setLoginPassword(e.target.value),
					className: inputClass$1,
					required: true
				})] }),
				/* @__PURE__ */ jsx("button", {
					type: "submit",
					disabled: loginBusy,
					className: buttonClass,
					children: loginBusy ? "Signing in..." : "Sign in"
				})
			]
		})]
	});
}
// src/components/Gallery.tsx
function Gallery({ images, loading, error, onOpen }) {
	if (error) return /* @__PURE__ */ jsx("div", {
		role: "alert",
		className: "rounded-xl border border-red-200 bg-red-50 px-4 py-8 text-center text-sm text-red-700",
		children: error
	});
	if (loading && images.length === 0) return /* @__PURE__ */ jsx("div", {
		className: "rounded-xl border border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-500",
		children: "Loading images..."
	});
	if (images.length === 0) return /* @__PURE__ */ jsxs("div", {
		className: "rounded-xl border border-dashed border-slate-300 bg-white px-4 py-16 text-center",
		children: [/* @__PURE__ */ jsx("p", {
			className: "text-base font-medium text-slate-700",
			children: "No images yet"
		}), /* @__PURE__ */ jsx("p", {
			className: "mt-1 text-sm text-slate-500",
			children: "Upload a PNG or JPEG to get started."
		})]
	});
	return /* @__PURE__ */ jsx("div", {
		className: `grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 ${loading ? "opacity-60" : ""}`,
		children: images.map((image) => /* @__PURE__ */ jsxs("button", {
			type: "button",
			onClick: () => onOpen(image),
			className: "group overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400",
			children: [/* @__PURE__ */ jsx("div", {
				className: "aspect-square w-full bg-slate-100",
				children: /* @__PURE__ */ jsx("img", {
					src: image.url,
					alt: image.title ?? image.filename,
					loading: "lazy",
					className: "h-full w-full object-cover"
				})
			}), /* @__PURE__ */ jsxs("div", {
				className: "p-3",
				children: [
					/* @__PURE__ */ jsx("p", {
						className: "truncate text-sm font-medium text-slate-900",
						children: image.title || image.filename
					}),
					/* @__PURE__ */ jsx("p", {
						className: "mt-1 truncate text-xs text-slate-500",
						children: image.uploader
					}),
					/* @__PURE__ */ jsx("p", {
						className: "text-xs text-slate-400",
						children: formatShortDate(image.uploaded_at)
					})
				]
			})]
		}, image.id))
	});
}
// src/components/ImageDetail.tsx
function ImageDetail({ image, session, onClose, onDelete }) {
	const [deleting, setDeleting] = useState(false);
	const canDelete = session !== null && session.username === image.uploader;
	useEffect(() => {
		const onKeyDown = (event) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose]);
	const handleDelete = async () => {
		if (deleting) return;
		const label = image.title || image.filename;
		if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
		setDeleting(true);
		try {
			await onDelete(image);
		} finally {
			setDeleting(false);
		}
	};
	return /* @__PURE__ */ jsx("div", {
		className: "fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4",
		onClick: onClose,
		role: "presentation",
		children: /* @__PURE__ */ jsxs("div", {
			role: "dialog",
			"aria-modal": "true",
			"aria-label": image.title || image.filename,
			className: "relative max-h-full w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6",
			onClick: (event) => event.stopPropagation(),
			children: [
				/* @__PURE__ */ jsx("button", {
					type: "button",
					onClick: onClose,
					"aria-label": "Close",
					className: "absolute right-3 top-3 rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400",
					children: "Close"
				}),
				/* @__PURE__ */ jsx("div", {
					className: "flex justify-center bg-slate-900/5 p-2 sm:p-4",
					children: /* @__PURE__ */ jsx("img", {
						src: image.url,
						alt: image.title ?? image.filename,
						className: "max-h-[65vh] w-auto max-w-full rounded-lg object-contain"
					})
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "mt-4",
					children: [
						/* @__PURE__ */ jsx("h2", {
							className: "truncate pr-16 text-lg font-semibold text-slate-900",
							children: image.title || image.filename
						}),
						/* @__PURE__ */ jsxs("dl", {
							className: "mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2",
							children: [
								/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("dt", {
									className: "text-slate-500",
									children: "Filename"
								}), /* @__PURE__ */ jsx("dd", {
									className: "font-medium text-slate-800 break-all",
									children: image.filename
								})] }),
								/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("dt", {
									className: "text-slate-500",
									children: "Title"
								}), /* @__PURE__ */ jsx("dd", {
									className: "font-medium text-slate-800",
									children: image.title || /* @__PURE__ */ jsx("span", {
										className: "text-slate-400",
										children: "None"
									})
								})] }),
								/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("dt", {
									className: "text-slate-500",
									children: "Size"
								}), /* @__PURE__ */ jsxs("dd", {
									className: "font-medium text-slate-800",
									children: [formatBytes(image.size_bytes), /* @__PURE__ */ jsxs("span", {
										className: "ml-1 font-normal text-slate-400",
										children: [
											"(",
											image.size_bytes,
											" bytes)"
										]
									})]
								})] }),
								/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("dt", {
									className: "text-slate-500",
									children: "Uploader"
								}), /* @__PURE__ */ jsx("dd", {
									className: "font-medium text-slate-800",
									children: image.uploader
								})] }),
								/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("dt", {
									className: "text-slate-500",
									children: "Uploaded"
								}), /* @__PURE__ */ jsx("dd", {
									className: "font-medium text-slate-800",
									children: formatFullDate(image.uploaded_at)
								})] }),
								/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("dt", {
									className: "text-slate-500",
									children: "Content type"
								}), /* @__PURE__ */ jsx("dd", {
									className: "font-medium text-slate-800",
									children: image.content_type
								})] })
							]
						}),
						/* @__PURE__ */ jsxs("div", {
							className: "mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-4",
							children: [/* @__PURE__ */ jsx("a", {
								href: image.url,
								target: "_blank",
								rel: "noreferrer",
								className: "text-sm font-medium text-blue-600 hover:underline",
								children: "Open full size"
							}), canDelete && /* @__PURE__ */ jsx("button", {
								type: "button",
								onClick: handleDelete,
								disabled: deleting,
								className: "rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
								children: deleting ? "Deleting..." : "Delete"
							})]
						})
					]
				})
			]
		})
	});
}
// src/components/UploadForm.tsx
var inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200";
function hasImageSignature(bytes) {
	const png = bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
	const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
	return png || jpeg;
}
function stripDataUrl(value) {
	const comma = value.indexOf(",");
	return comma >= 0 ? value.slice(comma + 1) : value;
}
function UploadForm({ session, onUploaded, onAuthError }) {
	const [title, setTitle] = useState("");
	const [error, setError] = useState(null);
	const [busy, setBusy] = useState(false);
	const [previewUrl, setPreviewUrl] = useState(null);
	const [fileName, setFileName] = useState(null);
	const [base64, setBase64] = useState(null);
	const inputRef = useRef(null);
	const resetFile = () => {
		setPreviewUrl(null);
		setFileName(null);
		setBase64(null);
		setTitle("");
		if (inputRef.current) inputRef.current.value = "";
	};
	const handleFileChange = async (event) => {
		setError(null);
		setPreviewUrl(null);
		setFileName(null);
		setBase64(null);
		const file = event.target.files?.[0];
		if (!file) return;
		if (!hasImageSignature(new Uint8Array(await file.slice(0, 8).arrayBuffer()))) {
			setError("Only PNG and JPEG images are supported.");
			if (inputRef.current) inputRef.current.value = "";
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			const result = String(reader.result ?? "");
			setPreviewUrl(result);
			setBase64(stripDataUrl(result));
			setFileName(file.name);
		};
		reader.onerror = () => setError("Could not read the selected file.");
		reader.readAsDataURL(file);
	};
	const handleSubmit = async (event) => {
		event.preventDefault();
		setError(null);
		if (!base64 || !fileName) {
			setError("Choose a PNG or JPEG image first.");
			return;
		}
		setBusy(true);
		try {
			await createImage({
				filename: fileName,
				data: base64,
				title: title.trim() || void 0
			}, session);
			resetFile();
			onUploaded();
		} catch (err) {
			if (err instanceof ApiError && err.status === 401) onAuthError("Your session expired. Please sign in again.");
			else setError(err instanceof Error ? err.message : "Upload failed.");
		} finally {
			setBusy(false);
		}
	};
	return /* @__PURE__ */ jsxs("form", {
		onSubmit: handleSubmit,
		className: "space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm",
		"aria-label": "Upload an image",
		children: [
			/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h2", {
				className: "text-base font-semibold text-slate-900",
				children: "Upload an image"
			}), /* @__PURE__ */ jsx("p", {
				className: "mt-1 text-sm text-slate-500",
				children: "PNG or JPEG files only. The format is detected from the file content."
			})] }),
			error && /* @__PURE__ */ jsx("p", {
				role: "alert",
				className: "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700",
				children: error
			}),
			/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("label", {
				htmlFor: "upload-file",
				className: "block text-sm font-medium text-slate-700",
				children: "Image file"
			}), /* @__PURE__ */ jsx("input", {
				id: "upload-file",
				ref: inputRef,
				type: "file",
				accept: "image/png,image/jpeg",
				onChange: handleFileChange,
				className: "mt-1 block w-full cursor-pointer rounded-lg border border-slate-300 bg-white text-sm text-slate-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
			})] }),
			/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsxs("label", {
				htmlFor: "upload-title",
				className: "block text-sm font-medium text-slate-700",
				children: ["Title ", /* @__PURE__ */ jsx("span", {
					className: "font-normal text-slate-400",
					children: "(optional)"
				})]
			}), /* @__PURE__ */ jsx("input", {
				id: "upload-title",
				type: "text",
				value: title,
				onChange: (e) => setTitle(e.target.value),
				placeholder: "A short caption",
				className: inputClass
			})] }),
			previewUrl && /* @__PURE__ */ jsxs("div", {
				className: "flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3",
				children: [/* @__PURE__ */ jsx("img", {
					src: previewUrl,
					alt: "Preview of the selected image",
					className: "h-24 w-24 rounded-md border border-slate-200 bg-white object-cover"
				}), /* @__PURE__ */ jsxs("div", {
					className: "min-w-0",
					children: [
						/* @__PURE__ */ jsx("p", {
							className: "truncate text-sm font-medium text-slate-800",
							children: fileName
						}),
						/* @__PURE__ */ jsx("p", {
							className: "mt-1 text-xs text-slate-500",
							children: "Preview"
						}),
						/* @__PURE__ */ jsx("button", {
							type: "button",
							onClick: resetFile,
							className: "mt-2 text-xs font-medium text-blue-600 hover:underline",
							children: "Remove file"
						})
					]
				})]
			}),
			/* @__PURE__ */ jsx("button", {
				type: "submit",
				disabled: busy || !base64,
				className: "w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto",
				children: busy ? "Uploading..." : "Upload"
			})
		]
	});
}
// src/App.tsx
var PAGE_SIZE = 12;
function totalPagesOf(total) {
	return Math.max(1, Math.ceil(total / PAGE_SIZE));
}
function App() {
	const [session, setSession] = useState(() => loadSession());
	const [page, setPage] = useState(1);
	const [list, setList] = useState({
		items: [],
		total: 0,
		page: 1,
		page_size: PAGE_SIZE
	});
	const [loading, setLoading] = useState(true);
	const [listError, setListError] = useState(null);
	const [selected, setSelected] = useState(null);
	const [notice, setNotice] = useState(null);
	const load = useCallback(async (pageToLoad) => {
		setLoading(true);
		try {
			const data = await listImages(pageToLoad, PAGE_SIZE);
			const pages = totalPagesOf(data.total);
			if (data.items.length === 0 && data.page > pages) {
				setPage(pages);
				return;
			}
			setList(data);
			setListError(null);
		} catch (err) {
			setListError(err instanceof Error ? err.message : "Failed to load images.");
		} finally {
			setLoading(false);
		}
	}, []);
	useEffect(() => {
		load(page);
	}, [page, load]);
	const handleAuthed = (next) => {
		saveSession(next);
		setSession(next);
		setNotice(null);
	};
	const handleSignOut = () => {
		saveSession(null);
		setSession(null);
		setSelected(null);
		setNotice("Signed out.");
	};
	const handleAuthError = (message) => {
		saveSession(null);
		setSession(null);
		setSelected(null);
		setNotice(message);
	};
	const handleUploaded = () => {
		setNotice(null);
		if (page === 1) load(1);
		else setPage(1);
	};
	const handleDelete = async (image) => {
		if (!session) return;
		try {
			await deleteImage(image.id, session);
			setSelected(null);
			setNotice(`Deleted "${image.title || image.filename}".`);
			await load(page);
		} catch (err) {
			if (err instanceof ApiError && err.status === 401) handleAuthError("Your session expired. Please sign in again.");
			else setNotice(err instanceof ApiError ? err.message : "Failed to delete image.");
		}
	};
	const pages = totalPagesOf(list.total);
	return /* @__PURE__ */ jsxs("div", {
		className: "min-h-screen bg-slate-100 text-slate-900",
		children: [
			/* @__PURE__ */ jsx("header", {
				className: "border-b border-slate-200 bg-white",
				children: /* @__PURE__ */ jsxs("div", {
					className: "mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4",
					children: [/* @__PURE__ */ jsx("h1", {
						className: "text-xl font-bold tracking-tight",
						children: "Image Gallery"
					}), session ? /* @__PURE__ */ jsxs("div", {
						className: "flex items-center gap-3",
						children: [/* @__PURE__ */ jsxs("span", {
							className: "text-sm text-slate-600",
							children: [
								"Signed in as",
								" ",
								/* @__PURE__ */ jsx("span", {
									className: "font-medium text-slate-900",
									children: session.username
								})
							]
						}), /* @__PURE__ */ jsx("button", {
							type: "button",
							onClick: handleSignOut,
							className: "rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300",
							children: "Sign out"
						})]
					}) : /* @__PURE__ */ jsx("span", {
						className: "text-sm text-slate-500",
						children: "Browsing as guest"
					})]
				})
			}),
			/* @__PURE__ */ jsxs("main", {
				className: "mx-auto max-w-6xl space-y-6 px-4 py-6",
				children: [
					notice && /* @__PURE__ */ jsxs("div", {
						role: "status",
						className: "flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm",
						children: [/* @__PURE__ */ jsx("span", { children: notice }), /* @__PURE__ */ jsx("button", {
							type: "button",
							onClick: () => setNotice(null),
							className: "font-medium text-slate-400 hover:text-slate-600",
							"aria-label": "Dismiss message",
							children: "Dismiss"
						})]
					}),
					!session ? /* @__PURE__ */ jsx(AuthForms, { onAuthed: handleAuthed }) : /* @__PURE__ */ jsx(UploadForm, {
						session,
						onUploaded: handleUploaded,
						onAuthError: handleAuthError
					}),
					/* @__PURE__ */ jsxs("section", {
						"aria-label": "Gallery",
						className: "space-y-4",
						children: [/* @__PURE__ */ jsx(Gallery, {
							images: list.items,
							loading,
							error: listError,
							onOpen: setSelected
						}), list.total > 0 && /* @__PURE__ */ jsxs("nav", {
							"aria-label": "Pagination",
							className: "flex flex-wrap items-center justify-between gap-3",
							children: [/* @__PURE__ */ jsxs("p", {
								className: "text-sm text-slate-600",
								children: [
									list.total,
									" image",
									list.total === 1 ? "" : "s",
									" · Page ",
									page,
									" of",
									" ",
									pages
								]
							}), /* @__PURE__ */ jsxs("div", {
								className: "flex gap-2",
								children: [/* @__PURE__ */ jsx("button", {
									type: "button",
									onClick: () => setPage((p) => Math.max(1, p - 1)),
									disabled: page <= 1,
									className: "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
									children: "Previous"
								}), /* @__PURE__ */ jsx("button", {
									type: "button",
									onClick: () => setPage((p) => Math.min(pages, p + 1)),
									disabled: page >= pages,
									className: "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
									children: "Next"
								})]
							})]
						})]
					})
				]
			}),
			selected && /* @__PURE__ */ jsx(ImageDetail, {
				image: selected,
				session,
				onClose: () => setSelected(null),
				onDelete: handleDelete
			})
		]
	});
}
export { App as default };
