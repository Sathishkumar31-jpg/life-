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
  const [endedPatient, setEndedPatient] = useState(null); // Track patient after call ends

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

  const handleEndCall = async (p) => {
    // Just set this patient as ended to show Pharmacy button
    // It will be completed AFTER saving prescription
    setEndedPatient(p);
  };

  const sendPrescription = async () => {
    const medsInput = document.getElementById("prescribedMeds").value;
    if (!medsInput) {
      alert("Please enter at least one medicine.");
      return;
    }
    const medicinesArray = medsInput.split(",").map(m => m.trim());
    
    // Complete the call and save medicines
    await fetch(`${API}/appointment/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: endedPatient._id,
        status: "COMPLETED",
        medicines: medicinesArray
      }),
    });

    alert("Prescription Saved Successfully!");
    setEndedPatient(null);
  };

  return (
    <div className="doctor-bg">
      <div className="doctor-glass">
        <h2>Doctor Dashboard</h2>

        <button className="emergency-btn" onClick={emergency}>
          🚨 Emergency Surgery
        </button>

        {/* 🔹 PHARMACY ACTION AFTER ENDING CALL */}
        {endedPatient && (
          <div style={{
            background: "#1e293b", margin: "15px 0", padding: "15px", 
            borderRadius: "10px", border: "2px solid #38bdf8", textAlign: "left"
          }}>
            <h3 style={{color:"#38bdf8", marginTop:0}}>Call Ended for {endedPatient.patientName}</h3>
            <p style={{fontSize: "14px"}}>Prescribe medicines to be saved in patient record:</p>
            <input 
              id="prescribedMeds" 
              type="text" 
              placeholder="e.g. Paracetamol 500mg, Cough Syrup" 
              style={{width: "100%", padding:"10px", marginBottom:"10px", borderRadius:"5px", border:"none"}}
            />
            <div style={{display: "flex", gap: "10px"}}>
              <button 
                onClick={sendPrescription}
                style={{background:"#22c55e", border:"none", padding:"10px 15px", color:"#fff", borderRadius:"5px", cursor:"pointer"}}
              >
                🩺 Save Prescription
              </button>
              <button 
                onClick={async () => {
                   await fetch(`${API}/appointment/status`, {
                     method: "POST", headers: { "Content-Type": "application/json" },
                     body: JSON.stringify({ id: endedPatient._id, status: "COMPLETED" })
                   });
                   setEndedPatient(null);
                }}
                style={{background:"#ef4444", border:"none", padding:"10px 15px", color:"#fff", borderRadius:"5px", cursor:"pointer"}}
              >
                ✕ Skip
              </button>
            </div>
          </div>
        )}

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
              <button onClick={() => handleEndCall(p)}>
                End Call
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
