import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { OPD_LIMIT_PER_DOCTOR } from "../config/queueLimits";
import "./DoctorDashboard.css";

const API = "http://localhost:5000";
const socket = io(API);

export default function DoctorDashboard() {
  const doctor = JSON.parse(sessionStorage.getItem("doctorSession"));
  const [session, setSession] = useState("morning");
  const [patients, setPatients] = useState([]);
  const [opdCount, setOpdCount] = useState(0);

  // 🔹 Load queue
  const load = async () => {
    const r = await fetch(
      `${API}/queue/doctor/${doctor.doctorId}?session=${session}`
    );
    const d = await r.json();
    setPatients(d.queue || []);
  };

  // 🔹 Load OPD count
  const loadOpdCount = async () => {
    const today = new Date().toISOString().split("T")[0];

    const r = await fetch(
      `${API}/queue/opd-count?doctorId=${doctor.doctorId}&session=${session}&date=${today}`
    );
    const d = await r.json();
    if (d.success) setOpdCount(d.count);
  };

  useEffect(() => {
    load();
    loadOpdCount();

    socket.on("QUEUE_UPDATE", () => {
      load();
      loadOpdCount();
    });

    return () => socket.off("QUEUE_UPDATE");
  }, [session]);

  const update = async (id, status) => {
    await fetch(`${API}/appointment/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
  };

  const emergency = async () => {
    await fetch(`${API}/doctor/emergency`, { method: "POST" });
  };

  return (
    <div className="doctor-bg">
      <div className="doctor-glass">
        <h2>Doctor Dashboard</h2>

        <button className="emergency-btn" onClick={emergency}>
          🚨 Emergency Surgery
        </button>

        {/* 🔹 OPD LOAD INDICATOR */}
        <div style={{ marginBottom: "20px" }}>
          <b>OPD Load</b>
          <p>
            {opdCount} / {OPD_LIMIT_PER_DOCTOR} patients
          </p>

          <progress
            value={opdCount}
            max={OPD_LIMIT_PER_DOCTOR}
            style={{ width: "100%" }}
          />

          {opdCount >= OPD_LIMIT_PER_DOCTOR && (
            <p style={{ color: "red", fontWeight: "bold" }}>
              ⚠ OPD LIMIT REACHED — New OPD patients redirected to Junior Doctor
            </p>
          )}
        </div>

        {/* SESSION TABS */}
        <div className="session-tabs">
          {["morning", "afternoon", "evening"].map((s) => (
            <button
              key={s}
              className={session === s ? "active" : ""}
              onClick={() => setSession(s)}
            >
              {s}
            </button>
          ))}
        </div>

        {/* PATIENT LIST */}
        {patients.map((p, i) => (
          <div key={p._id} className="patient-card">
            <b>
              Q-{i + 1} {p.patientName}
              {p.priorityType !== "OPD" && " 🚨"}
            </b>

            <p>Age: {p.patientAge}</p>

            <p>
              Priority:{" "}
              <span
                style={{
                  color: p.priorityType === "OPD" ? "#38bdf8" : "#ef4444",
                  fontWeight: "bold",
                }}
              >
                {p.priorityType}
              </span>
            </p>

            <p>Problem: {p.patientProblem}</p>

            {/* 🔥 SMART TIME-SLOT DISPLAY (NEW, SAFE) */}
            {p.arrivalWindow && (
              <p style={{ fontSize: "12px", color: "#22c55e" }}>
                ⏰ Expected Arrival: <b>{p.arrivalWindow}</b>
              </p>
            )}

            {p.status === "WAITING" && (
              <button onClick={() => update(p._id, "IN_PROGRESS")}>
                Call
              </button>
            )}
            {p.status === "IN_PROGRESS" && (
              <button onClick={() => update(p._id, "COMPLETED")}>
                End
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
