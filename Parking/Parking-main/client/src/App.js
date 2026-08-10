import React, { useState, useEffect } from "react";
import QRCode from "qrcode";

// Constants
const API_BASE = "http://localhost:5000/api";
const TOTAL = 60;
const RATES = { car: 100, bike: 50, truck: 150 };
const RATE_LABEL = { car: "₹100/hr", bike: "₹50/hr", truck: "₹150/hr" };

// API helper functions
const apiRequest = async (endpoint, options = {}) => {
  const token = localStorage.getItem("pq_token");
  const config = {
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, config);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "API request failed");
  }

  return data;
};

// Components
const SlotGrid = ({ slots, highlight, onSlotClick }) => {
  return (
    <div className="sgrid">
      {Object.entries(slots).map(([id, d]) => (
        <div
          key={id}
          className={`slot ${id === highlight ? "matched" : d.status}`}
          onClick={() => onSlotClick && onSlotClick(id)}
          style={{ cursor: onSlotClick ? "pointer" : "default" }}
        >
          <div className="sid">{id}</div>
          <div className="sst">
            {id === highlight ? "MATCHED" : d.status.toUpperCase()}
          </div>
          <div className="spl">{d.plate || "—"}</div>
        </div>
      ))}
    </div>
  );
};

const VerificationPage = ({ currentUser, onBack }) => {
  const [qrInput, setQrInput] = useState("");
  const [verificationResult, setVerificationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleVerify = async () => {
    if (!qrInput.trim()) {
      setError("Please enter a QR code");
      return;
    }

    setLoading(true);
    setError("");
    setVerificationResult(null);

    try {
      const result = await apiRequest("/parking/verify", {
        method: "POST",
        body: JSON.stringify({ code: qrInput.trim() }),
      });

      setVerificationResult(result);
      if (result.newCode) {
        setQrInput(result.newCode);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (!verificationResult) return;

    setLoading(true);
    try {
      const result = await apiRequest("/parking/checkout", {
        method: "POST",
        body: JSON.stringify({ code: qrInput.trim() }),
      });

      alert(
        `✅ Checkout successful!\nSlot: ${result.slot}\nDuration: ${result.duration.hours}h ${result.duration.minutes}m\nFee: ₹${result.fee}`,
      );
      setQrInput("");
      setVerificationResult(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="card-title">QR Code Verification</div>

      <div className="fg">
        <label>Enter QR Code</label>
        <input
          type="text"
          value={qrInput}
          onChange={(e) => setQrInput(e.target.value)}
          placeholder="Scan or enter parking QR code..."
          onKeyPress={(e) => e.key === "Enter" && handleVerify()}
        />
      </div>

      <div className="brow">
        <button className="btn-g" onClick={handleVerify} disabled={loading}>
          {loading ? "Verifying..." : "Verify QR Code"}
        </button>
        {currentUser?.role === "admin" && verificationResult && (
          <button className="btn-r" onClick={handleCheckout} disabled={loading}>
            {loading ? "Processing..." : "Checkout Vehicle"}
          </button>
        )}
        <button className="btn-o" onClick={onBack}>
          Back
        </button>
      </div>

      {error && (
        <div
          style={{ color: "var(--red)", marginTop: "10px", fontSize: "0.9rem" }}
        >
          {error}
        </div>
      )}

      {verificationResult && (
        <div
          style={{
            marginTop: "20px",
            padding: "15px",
            background: "var(--surf2)",
            borderRadius: "8px",
          }}
        >
          <h3 style={{ color: "var(--green)", marginBottom: "10px" }}>
            ✓ Verification Successful
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "10px",
              fontSize: "0.9rem",
            }}
          >
            <div>
              <strong>Slot:</strong> {verificationResult.session.slot}
            </div>
            <div>
              <strong>Plate:</strong> {verificationResult.session.plate}
            </div>
            <div>
              <strong>Driver:</strong> {verificationResult.session.name}
            </div>
            <div>
              <strong>Phone:</strong> {verificationResult.session.phone}
            </div>
            <div>
              <strong>Vehicle:</strong>{" "}
              {verificationResult.session.vtype.toUpperCase()}
            </div>
            <div>
              <strong>Entry Time:</strong>{" "}
              {new Date(verificationResult.session.entryTime).toLocaleString()}
            </div>
            <div>
              <strong>Duration:</strong> {verificationResult.duration.hours}h{" "}
              {verificationResult.duration.minutes}m
            </div>
            <div>
              <strong>Fee Due:</strong> ₹{verificationResult.feeDue}
            </div>
          </div>
          {verificationResult.newCode && (
            <div
              style={{
                marginTop: "15px",
                padding: "12px",
                background: "#0f172a",
                borderRadius: "8px",
                color: "#a3e635",
              }}
            >
              <strong>QR code rotated.</strong> Use the new code below for the
              next scan.
              <div style={{ marginTop: "8px", wordBreak: "break-word" }}>
                {verificationResult.newCode}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const UserQRCode = ({ user, autoShow = true, verifyMode = false }) => {
  const [userQrUrl, setUserQrUrl] = useState("");
  const [showUserQR, setShowUserQR] = useState(false);
  const [error, setError] = useState("");

  const generateUserQR = React.useCallback(() => {
    if (!user) {
      setError("User data not available");
      return;
    }

    setError("");

    const userData = {
      type: "user",
      username: user.username,
      display: user.display || `${user.fname} ${user.lname}`,
      role: user.role,
      email: user.email,
      phone: user.phone,
      plate: user.plate,
      vtype: user.vtype,
    };

    const qrText = JSON.stringify(userData);
    QRCode.toDataURL(qrText, { errorCorrectionLevel: "M" }, (err, url) => {
      if (err) {
        setError("Failed to generate QR code: " + err.message);
      } else {
        setUserQrUrl(url);
        setShowUserQR(true);
        setError("");
      }
    });
  }, [user]);

  useEffect(() => {
    if (user && autoShow) {
      generateUserQR();
    }
  }, [user, autoShow, generateUserQR]);

  return (
    <div style={{ marginTop: "20px" }}>
      {!autoShow && (
        <button className="btn-o" onClick={generateUserQR}>
          Generate My QR Code
        </button>
      )}

      {error && (
        <div
          style={{ color: "var(--red)", marginTop: "10px", fontSize: "0.9rem" }}
        >
          {error}
        </div>
      )}

      {showUserQR && userQrUrl && (
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <h3>{verifyMode ? "Verify Code" : "My User QR Code"}</h3>
          <img
            src={userQrUrl}
            alt="Verify QR Code"
            style={{
              maxWidth: "200px",
              border: "2px solid var(--accent)",
              borderRadius: "8px",
            }}
          />
          <p
            style={{
              marginTop: "10px",
              fontSize: "0.9rem",
              color: "var(--muted)",
            }}
          >
            This QR code contains your booking verification information.
            <br />
            Use it to verify your booking details at the entry or exit gate.
          </p>
          <button
            className="btn-b"
            style={{ marginTop: "10px" }}
            onClick={() => setShowUserQR(false)}
          >
            Hide QR Code
          </button>
        </div>
      )}
    </div>
  );
};

const QRCodeDisplay = ({ qrData }) => {
  const [qrUrl, setQrUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (qrData) {
      setError("");
      QRCode.toDataURL(qrData, { errorCorrectionLevel: "M" }, (err, url) => {
        if (err) {
          setError("Failed to generate QR code: " + err.message);
        } else {
          setQrUrl(url);
        }
      });
    }
  }, [qrData]);

  if (error) {
    return (
      <div
        style={{ textAlign: "center", marginTop: "20px", color: "var(--red)" }}
      >
        <p>{error}</p>
      </div>
    );
  }

  if (!qrUrl) return null;

  return (
    <div style={{ textAlign: "center", marginTop: "20px" }}>
      <h3>UPI Scanner</h3>
      <img src={qrUrl} alt="UPI Scanner QR Code" style={{ maxWidth: "200px" }} />
      <p>Scan this code with a UPI app to pay the booking amount.</p>
    </div>
  );
};

const AuthScreen = ({ onLogin }) => {
  const [mode, setMode] = useState("login");
  const [role, setRole] = useState("user");
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    fname: "",
    lname: "",
    email: "",
    phone: "",
    plate: "",
    vtype: "car",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (errors[e.target.name]) {
      setErrors({ ...errors, [e.target.name]: "" });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setErrors({});

    try {
      const endpoint =
        mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        mode === "login"
          ? { username: formData.username, password: formData.password, role }
          : {
              fname: formData.fname,
              lname: formData.lname,
              email: formData.email,
              phone: formData.phone,
              username: formData.username,
              plate: formData.plate,
              vtype: formData.vtype,
              password: formData.password,
            };

      const response = await fetch(`http://localhost:5000${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.errors) {
          setErrors(data.errors);
        } else {
          setMessage(data.error || "An error occurred");
        }
        return;
      }

      // Success
      localStorage.setItem("pq_token", data.token);
      localStorage.setItem("pq_current_user", JSON.stringify(data.user));
      localStorage.setItem("pq_current_role", data.user.role);
      setMessage(
        mode === "login" ? "Login successful!" : "Registration successful!",
      );
      setTimeout(() => onLogin(), 1000);
    } catch (error) {
      setMessage("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="auth-screen">
      <div className="auth-box">
        <div className="auth-logo">
          Park<b>QR</b>
        </div>
        <div className="auth-tag">Smart Parking System</div>

        <div className="auth-switcher">
          <button
            className={`auth-sw-btn ${mode === "login" ? "active" : ""}`}
            onClick={() => setMode("login")}
          >
            Login
          </button>
          <button
            className={`auth-sw-btn ${mode === "register" ? "active" : ""}`}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>

        {mode === "login" && (
          <div className="role-tabs">
            <button
              className={`role-tab ${role === "user" ? "active" : ""}`}
              onClick={() => setRole("user")}
            >
              <div className="role-icon">👤</div>
              <div>User</div>
            </button>
            <button
              className={`role-tab ${role === "admin" ? "active" : ""}`}
              onClick={() => setRole("admin")}
            >
              <div className="role-icon">⚙️</div>
              <div>Admin</div>
            </button>
          </div>
        )}

        {message && (
          <div
            className={`auth-msg ${message.includes("successful") ? "ok" : "err"}`}
          >
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="auth-card">
            <h2>{mode === "login" ? "Welcome Back" : "Create Account"}</h2>

            {mode === "register" && (
              <div className="frow">
                <div className="fg">
                  <label>First Name</label>
                  <input
                    type="text"
                    name="fname"
                    value={formData.fname}
                    onChange={handleInputChange}
                    required
                  />
                  {errors.fname && (
                    <div className="field-err">{errors.fname}</div>
                  )}
                </div>
                <div className="fg">
                  <label>Last Name</label>
                  <input
                    type="text"
                    name="lname"
                    value={formData.lname}
                    onChange={handleInputChange}
                    required
                  />
                  {errors.lname && (
                    <div className="field-err">{errors.lname}</div>
                  )}
                </div>
              </div>
            )}

            <div className="fg">
              <label>Username</label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                required
              />
              {errors.uname && <div className="field-err">{errors.uname}</div>}
            </div>

            <div className="fg">
              <label>Password</label>
              <div className="pw-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  required
                />
                <button
                  type="button"
                  className="pw-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "🙈" : "👁️"}
                </button>
              </div>
              {errors.pass && <div className="field-err">{errors.pass}</div>}
            </div>

            {mode === "register" && (
              <>
                <div className="fg">
                  <label>Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                  />
                  {errors.email && (
                    <div className="field-err">{errors.email}</div>
                  )}
                </div>
                <div className="fg">
                  <label>Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    required
                  />
                  {errors.phone && (
                    <div className="field-err">{errors.phone}</div>
                  )}
                </div>
                <div className="fg">
                  <label>Vehicle Type</label>
                  <select
                    name="vtype"
                    value={formData.vtype}
                    onChange={handleInputChange}
                  >
                    <option value="car">Car</option>
                    <option value="bike">Bike</option>
                    <option value="truck">Truck</option>
                  </select>
                </div>
                <div className="fg">
                  <label>Vehicle Plate</label>
                  <input
                    type="text"
                    name="plate"
                    value={formData.plate}
                    onChange={handleInputChange}
                    placeholder="e.g. ABC-123"
                  />
                </div>
              </>
            )}

            <button type="submit" className="btn-auth" disabled={loading}>
              {loading
                ? "Please wait..."
                : mode === "login"
                  ? "Login"
                  : "Register"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const MainApp = ({ onLogout }) => {
  const [currentPage, setCurrentPage] = useState("book");
  const [slots, setSlots] = useState({});
  const [availableSlots, setAvailableSlots] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);
  const [bookingForm, setBookingForm] = useState({
    slot: "",
    vtype: "car",
    plate: "",
  });
  const [paymentQrData, setPaymentQrData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dailyBookings, setDailyBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [slotDetails, setSlotDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    loadUserData();
    loadSlots();
    loadAvailableSlots();
    if (currentRole === "admin") {
      loadDailyBookings();
    }
  }, [currentRole]);

  const loadUserData = () => {
    const userStr = localStorage.getItem("pq_current_user");
    if (userStr) {
      const user = JSON.parse(userStr);
      setCurrentUser(user);
      setCurrentRole(user.role);
      setBookingForm((prev) => ({
        ...prev,
        vtype: user.vtype || "car",
        plate: user.plate || "",
      }));
    }
  };

  const loadSlots = async () => {
    try {
      const data = await apiRequest("/parking/slots");
      setSlots(data.slots);
    } catch (err) {
      console.error("Failed to load slots:", err);
    }
  };

  const loadAvailableSlots = async () => {
    try {
      const data = await apiRequest("/parking/slots/available");
      setAvailableSlots(data.available);
    } catch (err) {
      console.error("Failed to load available slots:", err);
    }
  };

  const loadDailyBookings = async () => {
    setBookingsLoading(true);
    try {
      const data = await apiRequest("/admin/history?filter=today");
      setDailyBookings(data.history);
    } catch (err) {
      console.error("Failed to load daily bookings:", err);
    } finally {
      setBookingsLoading(false);
    }
  };

  const loadSlotDetails = async (slotId) => {
    setDetailsLoading(true);
    setSelectedSlot(slotId);
    try {
      const data = await apiRequest(`/admin/booking-details/${slotId}`);
      setSlotDetails(data);
    } catch (err) {
      console.error("Failed to load slot details:", err);
      alert("Failed to load slot details: " + err.message);
    } finally {
      setDetailsLoading(false);
    }
  };

  const cancelBooking = async (slotId) => {
    const confirmed = window.confirm(
      `Are you sure you want to cancel the booking for slot ${slotId}? This will free up the slot.`,
    );
    if (!confirmed) {
      return;
    }

    try {
      await apiRequest(`/admin/bookings/${slotId}`, { method: "DELETE" });
      alert(`Booking for slot ${slotId} has been cancelled successfully!`);
      await loadSlots();
      await loadAvailableSlots();
      await loadDailyBookings();
      if (selectedSlot === slotId) {
        setSlotDetails(null);
        setSelectedSlot(null);
      }
    } catch (err) {
      console.error("Failed to cancel booking:", err);
      alert("Failed to cancel booking: " + err.message);
    }
  };

  const handleBookingChange = (e) => {
    setBookingForm({ ...bookingForm, [e.target.name]: e.target.value });
  };

  const handleBookSlot = async (e) => {
    e.preventDefault();
    const { slot, vtype, plate } = bookingForm;
    if (!slot || !plate) {
      setError("Please select a slot and enter your plate number");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await apiRequest("/parking/ticket", {
        method: "POST",
        body: JSON.stringify({
          plate: plate.toUpperCase(),
          name:
            currentUser.display || `${currentUser.fname} ${currentUser.lname}`,
          phone: currentUser.phone,
          vtype,
          slot,
        }),
      });

      const amount = RATES[vtype] || 100;
      const upiId = "yyeswanth457@oksbi";
      const receiverName = "ParkQR Parking";
      const transactionNote = `Parking Slot ${slot} Booking`;
      const paymentLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(
        receiverName
      )}&am=${amount}&tn=${encodeURIComponent(transactionNote)}`;

      setPaymentQrData(paymentLink);
      await loadSlots();
      await loadAvailableSlots();
      setCurrentPage("book"); // Stay on book page to show QR
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentRole(null);
    localStorage.removeItem("pq_current_user");
    localStorage.removeItem("pq_current_role");
    localStorage.removeItem("pq_token");
    onLogout();
  };

  return (
    <div id="app">
      <nav>
        <div className="logo">
          Park<b>QR</b>
        </div>
        <div className="nav-user">
          <div className="nav-name">
            {currentUser?.fname} {currentUser?.lname}
          </div>
          <div className="nav-role">{currentRole?.toUpperCase()}</div>
          <button className="btn-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </nav>

      <div className="tabs">
        <button
          className={`tab ${currentPage === "book" ? "on" : ""}`}
          onClick={() => setCurrentPage("book")}
        >
          Book Slot
        </button>
        <button
          className={`tab ${currentPage === "verify" ? "on" : ""}`}
          onClick={() => setCurrentPage("verify")}
        >
          Verify QR
        </button>
        <button
          className={`tab ${currentPage === "profile" ? "on" : ""}`}
          onClick={() => setCurrentPage("profile")}
        >
          My Profile
        </button>
        {currentRole === "admin" && (
          <button
            className={`tab ${currentPage === "admin" ? "on" : ""}`}
            onClick={() => setCurrentPage("admin")}
          >
            Admin
          </button>
        )}
      </div>

      <div className={`page ${currentPage === "book" ? "on" : ""}`}>
        <div className="card">
          <div className="card-title">Book a Parking Slot</div>

          {error && (
            <div
              style={{
                color: "var(--red)",
                marginBottom: "15px",
                fontSize: "0.9rem",
              }}
            >
              {error}
            </div>
          )}

          {!paymentQrData ? (
            <form onSubmit={handleBookSlot}>
              <div className="row">
                <div className="fg">
                  <label>Vehicle Type</label>
                  <select
                    name="vtype"
                    value={bookingForm.vtype}
                    onChange={handleBookingChange}
                  >
                    <option value="car">Car - ₹100/hr</option>
                    <option value="bike">Bike - ₹50/hr</option>
                    <option value="truck">Truck - ₹150/hr</option>
                  </select>
                </div>
                <div className="fg">
                  <label>License Plate</label>
                  <input
                    type="text"
                    name="plate"
                    value={bookingForm.plate}
                    onChange={handleBookingChange}
                    placeholder="e.g. ABC-123"
                    required
                  />
                </div>
              </div>
              <div className="fg">
                <label>Available Slot</label>
                <select
                  name="slot"
                  value={bookingForm.slot}
                  onChange={handleBookingChange}
                  required
                >
                  <option value="">Select slot...</option>
                  {availableSlots.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="brow">
                <button type="submit" className="btn-g" disabled={loading}>
                  {loading ? "Booking..." : "Book Slot & Generate QR"}
                </button>
              </div>
            </form>
          ) : (
            <div>
              <div
                style={{
                  color: "var(--green)",
                  marginBottom: "15px",
                  fontSize: "1.1rem",
                }}
              >
                ✓ Slot booked successfully! Your UPI payment QR code is ready.
              </div>

              <div style={{ marginTop: "10px", marginBottom: "20px" }}>
                <QRCodeDisplay qrData={paymentQrData} />
              </div>

              <div style={{ marginTop: "30px", paddingTop: "20px", borderTop: "1px solid var(--bdr)" }}>
                <h3 style={{ textAlign: "center", marginBottom: "15px" }}>Verify Code</h3>
                <UserQRCode user={currentUser} autoShow={true} verifyMode={true} />
              </div>

              <div className="brow" style={{ marginTop: "20px" }}>
                <button
                  className="btn-o"
                  onClick={() => {
                    setPaymentQrData(null);
                    setBookingForm({
                      slot: "",
                      vtype: bookingForm.vtype,
                      plate: bookingForm.plate,
                    });
                    loadAvailableSlots();
                  }}
                >
                  Book Another Slot
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={`page ${currentPage === "verify" ? "on" : ""}`}>
        <VerificationPage
          currentUser={currentUser}
          onBack={() => setCurrentPage("book")}
        />
      </div>

      <div className={`page ${currentPage === "profile" ? "on" : ""}`}>
        <div className="card">
          <div className="card-title">My Profile</div>
          {currentUser && (
            <div className="row">
              <div className="fg">
                <label>Full Name</label>
                <input
                  type="text"
                  value={
                    currentUser.display ||
                    `${currentUser.fname} ${currentUser.lname}`
                  }
                  readOnly
                />
              </div>
              <div className="fg">
                <label>Username</label>
                <input
                  type="text"
                  value={currentUser.username || ""}
                  readOnly
                />
              </div>
              <div className="fg">
                <label>Email</label>
                <input type="email" value={currentUser.email || ""} readOnly />
              </div>
              <div className="fg">
                <label>Phone</label>
                <input type="tel" value={currentUser.phone || ""} readOnly />
              </div>
              <div className="fg">
                <label>Vehicle Type</label>
                <input type="text" value={currentUser.vtype || ""} readOnly />
              </div>
              <div className="fg">
                <label>License Plate</label>
                <input type="text" value={currentUser.plate || ""} readOnly />
              </div>
            </div>
          )}

          <UserQRCode user={currentUser} autoShow={false} />
        </div>
      </div>

      {currentRole === "admin" && (
        <div className={`page ${currentPage === "admin" ? "on" : ""}`}>
          <div className="card">
            <div className="card-title">Admin Panel</div>
            <div
              className="agrid"
              style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}
            >
              <div>
                <div
                  className="card-title"
                  style={{ marginTop: "4px", fontSize: ".78rem" }}
                >
                  Live Slot Map
                </div>
                <SlotGrid slots={slots} onSlotClick={loadSlotDetails} />
              </div>
              <div>
                <div
                  className="card-title"
                  style={{ marginTop: "4px", fontSize: ".78rem" }}
                >
                  Quick Actions
                </div>
                <div className="brow" style={{ marginTop: "10px" }}>
                  <button
                    className="btn-b"
                    onClick={() => setCurrentPage("verify")}
                  >
                    Verify QR Code
                  </button>
                </div>
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--muted)",
                    marginTop: "10px",
                  }}
                >
                  Use the Verify QR tab to scan parking QR codes for checkout
                  and verification.
                </p>
              </div>
              <div>
                <div
                  className="card-title"
                  style={{ marginTop: "4px", fontSize: ".78rem" }}
                >
                  Daily Bookings
                </div>
                {bookingsLoading ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "20px",
                      color: "var(--muted)",
                    }}
                  >
                    Loading bookings...
                  </div>
                ) : dailyBookings.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "20px",
                      color: "var(--muted)",
                    }}
                  >
                    No bookings today
                  </div>
                ) : (
                  <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        fontSize: "0.8rem",
                        borderCollapse: "collapse",
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            background: "var(--surf2)",
                            position: "sticky",
                            top: 0,
                          }}
                        >
                          <th
                            style={{
                              padding: "8px",
                              textAlign: "left",
                              borderBottom: "1px solid var(--border)",
                            }}
                          >
                            User
                          </th>
                          <th
                            style={{
                              padding: "8px",
                              textAlign: "left",
                              borderBottom: "1px solid var(--border)",
                            }}
                          >
                            Slot
                          </th>
                          <th
                            style={{
                              padding: "8px",
                              textAlign: "left",
                              borderBottom: "1px solid var(--border)",
                            }}
                          >
                            Time
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyBookings.map((booking, index) => (
                          <tr
                            key={index}
                            style={{ borderBottom: "1px solid var(--border)" }}
                          >
                            <td style={{ padding: "8px" }}>{booking.name}</td>
                            <td style={{ padding: "8px" }}>{booking.slot}</td>
                            <td style={{ padding: "8px" }}>
                              {new Date(booking.entryTime).toLocaleTimeString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="brow" style={{ marginTop: "10px" }}>
                  <button
                    className="btn-o"
                    onClick={loadDailyBookings}
                    disabled={bookingsLoading}
                  >
                    {bookingsLoading ? "Loading..." : "Refresh"}
                  </button>
                </div>
              </div>
            </div>

            {/* Slot Details Modal */}
            {selectedSlot && (
              <div
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: "rgba(0,0,0,0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1000,
                }}
              >
                <div
                  style={{
                    background: "var(--bg)",
                    borderRadius: "12px",
                    padding: "20px",
                    maxWidth: "500px",
                    width: "90%",
                    maxHeight: "80vh",
                    overflowY: "auto",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "20px",
                    }}
                  >
                    <h3 style={{ margin: 0, color: "var(--accent)" }}>
                      Slot {selectedSlot} Details
                    </h3>
                    <button
                      onClick={() => {
                        setSelectedSlot(null);
                        setSlotDetails(null);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        fontSize: "20px",
                        cursor: "pointer",
                        color: "var(--muted)",
                      }}
                    >
                      ×
                    </button>
                  </div>

                  {detailsLoading ? (
                    <div style={{ textAlign: "center", padding: "20px" }}>
                      Loading slot details...
                    </div>
                  ) : slotDetails ? (
                    <div>
                      <div
                        style={{
                          marginBottom: "20px",
                          padding: "15px",
                          background: "var(--surf2)",
                          borderRadius: "8px",
                        }}
                      >
                        <h4
                          style={{
                            margin: "0 0 10px 0",
                            color:
                              slotDetails.status === "occupied"
                                ? "var(--red)"
                                : "var(--green)",
                          }}
                        >
                          Status: {slotDetails.status.toUpperCase()}
                        </h4>

                        {slotDetails.currentBooking && (
                          <div>
                            <h5 style={{ margin: "10px 0 5px 0" }}>
                              Current Booking:
                            </h5>
                            <div style={{ fontSize: "0.9rem" }}>
                              <p>
                                <strong>Name:</strong>{" "}
                                {slotDetails.currentBooking.name}
                              </p>
                              <p>
                                <strong>Plate:</strong>{" "}
                                {slotDetails.currentBooking.plate}
                              </p>
                              <p>
                                <strong>Phone:</strong>{" "}
                                {slotDetails.currentBooking.phone}
                              </p>
                              <p>
                                <strong>Vehicle:</strong>{" "}
                                {slotDetails.currentBooking.vtype.toUpperCase()}
                              </p>
                              <p>
                                <strong>Entry Time:</strong>{" "}
                                {new Date(
                                  slotDetails.currentBooking.entryTime,
                                ).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {slotDetails.history &&
                        slotDetails.history.length > 0 && (
                          <div style={{ marginBottom: "20px" }}>
                            <h5>Recent History:</h5>
                            <div
                              style={{ maxHeight: "150px", overflowY: "auto" }}
                            >
                              {slotDetails.history.map((booking, index) => (
                                <div
                                  key={index}
                                  style={{
                                    padding: "8px",
                                    margin: "5px 0",
                                    background: "var(--surf)",
                                    borderRadius: "4px",
                                    fontSize: "0.8rem",
                                  }}
                                >
                                  <div>
                                    <strong>{booking.name}</strong> -{" "}
                                    {new Date(
                                      booking.entryTime,
                                    ).toLocaleDateString()}
                                  </div>
                                  <div style={{ color: "var(--muted)" }}>
                                    Status: {booking.status} | Fee: ₹
                                    {booking.fee || 0}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      <div className="brow">
                        {slotDetails.status === "occupied" && (
                          <button
                            className="btn-r"
                            onClick={() => cancelBooking(selectedSlot)}
                            style={{ marginRight: "10px" }}
                          >
                            Cancel Booking
                          </button>
                        )}
                        <button
                          className="btn-o"
                          onClick={() => {
                            setSelectedSlot(null);
                            setSlotDetails(null);
                          }}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "20px",
                        color: "var(--red)",
                      }}
                    >
                      Failed to load slot details
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("pq_token");
    const user = localStorage.getItem("pq_current_user");
    if (token && user) {
      setIsLoggedIn(true);
    }
  }, []);

  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    localStorage.removeItem("pq_token");
    localStorage.removeItem("pq_current_user");
    localStorage.removeItem("pq_current_role");
    setIsLoggedIn(false);
  };

  return isLoggedIn ? (
    <MainApp onLogout={handleLogout} />
  ) : (
    <AuthScreen onLogin={handleLogin} />
  );
}

export default App;
