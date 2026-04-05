import { useEffect, useRef, useState } from "react";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import HospitalMap from "../components/HospitalMap";
import "./QueuePage.css";

const API = "http://localhost:5000";
const AVG = 5 * 60;
const socket = io(API);

const JUNIOR_DOCTORS = [
  { id: "10", name: "Dr. Arun (GP)" },
  { id: "11", name: "Dr. Divya (GP)" },
  { id: "12", name: "Dr. Sanjay (GP)" },
];

export default function QueuePage() {
  const nav = useNavigate();
  const redirected = useRef(false);

  const [user, setUser] = useState(null);
  const [appt, setAppt] = useState(null);
  const [queue, setQueue] = useState([]);
  const [showThanks, setShowThanks] = useState(false);
  const [emergency, setEmergency] = useState(false);
  const [showGP, setShowGP] = useState(false);
  const [showMap, setShowMap] = useState(false);

  // 🔐 AUTH
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (!u) nav("/login");
      else setUser(u);
    });
  }, []);

  // 🔄 LOAD DATA
  const load = async (uid) => {
    const p = await fetch(`${API}/queue/patient/${uid}`);
    const pd = await p.json();
    if (!pd.appointment) return;

    const appointment = pd.appointment;
    setAppt(appointment);

    // 🔥 COMPLETED HANDLING
    if (appointment.status === "COMPLETED") {
      setQueue([]);

      if (!redirected.current) {
        redirected.current = true;
        setShowThanks(true);

        setTimeout(() => {
          nav("/");
        }, 5000);
      }
      return;
    }

    // 🧠 LOAD QUEUE
    const q = await fetch(
      `${API}/queue/doctor/${appointment.doctorId}?session=${appointment.session}`
    );
    const qd = await q.json();
    setQueue(qd.queue || []);
  };

  // 🔔 SOCKET LISTENERS
  useEffect(() => {
    if (!user) return;

    load(user.uid);

    socket.on("QUEUE_UPDATE", () => load(user.uid));
    socket.on("DOCTOR_EMERGENCY", () => setEmergency(true));

    return () => {
      socket.off("QUEUE_UPDATE");
      socket.off("DOCTOR_EMERGENCY");
    };
  }, [user]);



  if (!appt) return <p>Loading...</p>;

  // QUEUE MATH
  const idx = queue.findIndex((q) => q._id === appt._id);
  const myToken = appt.tokenNumber || idx + 1;
  const inProgress = queue.find(q => q.status === "IN_PROGRESS");
  const nowServingToken = inProgress ? inProgress.tokenNumber : (
      queue.length > 0 && queue[0]._id !== appt._id ? queue[0].tokenNumber : "--"
  );
  const waitingTime = idx > 0 ? idx * AVG : 0;
  const etaMinutes = Math.floor(waitingTime / 60);



  // 🔁 TRANSFER TO GP
  const transfer = async (gp) => {
    await fetch(`${API}/appointment/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: appt._id,
        doctorId: gp.id,
        doctorName: gp.name,
      }),
    });

    setEmergency(false);
    setShowGP(false);
  };

  // 🏥 CHECK IN
  const handleCheckIn = async () => {
    await fetch(`${API}/appointment/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: appt._id }),
    });
    // Immediately optimistic update
    setAppt({ ...appt, isInsideHospital: true });
  };



  return (
    <div className="queue-container">
      {/* SMART INDOOR NAVIGATION MODAL */}
      {showMap && (
        <HospitalMap 
          doctorFloor={appt.doctorFloor} 
          doctorRoom={appt.doctorRoom} 
          doctorName={appt.doctorName} 
          onClose={() => setShowMap(false)} 
        />
      )}

      {/* LEFT */}
      <div className="queue-card">
        <h2>Queue Tracker</h2>

        <div className="patient-info">
           <p><strong>Name:</strong> {appt.patientName} (Age: {appt.patientAge})</p>
           <p><strong>Problem:</strong> {appt.patientProblem}</p>
        </div>

        {/* LOCATION INFO */}
        <div className="doc-location-box">
           <h4>Doctor Location Live Update</h4>
           <p><strong>Doctor:</strong> {appt.doctorName}</p>
           <p><strong>Location:</strong> {appt.doctorRoom} — {appt.doctorFloor} Floor</p>
           <div className="simple-dir">
              <p>Go to {appt.doctorFloor} Floor ⬆️</p>
              <p>{appt.doctorRoom} → Left side</p>
           </div>
           <button className="open-map-btn" onClick={() => setShowMap(true)}>
             Show Hospital Map 📍
           </button>
        </div>

        {/* ✅ COMPLETED */}
        {showThanks && (
          <div className="status success">
            🙏 Consultation Over <br />
            Thanks for coming <br />
            Redirecting to home…
          </div>
        )}

        {/* 🟠 IN PROGRESS */}
        {!showThanks && appt.status === "IN_PROGRESS" && (
          <div className="status warning pulse">
            <h2>Now Consulting</h2>
            <p>Please enter the doctor's room immediately.</p>
          </div>
        )}

        {/* 🟡 WAITING */}
        {!showThanks && appt.status === "WAITING" && idx >= 0 && (
          <>
            <div className="tokens-display">
               <div className="token-box">
                  <span className="label">Now Serving</span>
                  <span className="value">{nowServingToken}</span>
               </div>
               <div className="token-box highlight">
                  <span className="label">Your Token</span>
                  <span className="value">{myToken}</span>
               </div>
            </div>
            {idx === 0 && appt.status === "WAITING" && (
               <p style={{textAlign:"center", color:"#38bdf8", marginTop:"-10px", marginBottom:"20px", fontWeight:"600"}}>
                 (Doctor will call you shortly!)
               </p>
            )}

            {/* SMART ARRIVAL ALERT */}
            <div className="smart-arrival">
                {etaMinutes > 10 && (
                   <div className="alert info">
                     ⏳ You should reach hospital in ~{etaMinutes} minutes. 
                     ({idx} patients ahead)
                   </div>
                )}
                {etaMinutes <= 10 && etaMinutes > 5 && (
                   <div className="alert warning pulse">
                     🚶‍♂️ Please start now. You should reach in ~{etaMinutes} mins.
                   </div>
                )}
                {etaMinutes <= 5 && (
                   <div className="alert danger pulse">
                     ⏰ You will be called soon! Please be at the waiting area.
                   </div>
                )}
            </div>

            {/* CHECK-IN */}
            <div className="checkin-section">
               {appt.isInsideHospital ? (
                 <div className="checked-in-badge">✔ You are inside hospital</div>
               ) : (
                 <button className="checkin-btn" onClick={handleCheckIn}>
                    I have reached the hospital 🏥
                 </button>
               )}
            </div>

          </>
        )}
      </div>

      {/* RIGHT – LIVE QUEUE */}
      <div className="live-queue">
        <h3>Live Queue ({queue.length} left)</h3>

        {queue.length === 0 && <p>No active patients</p>}

        {queue.map((p, i) => (
          <div key={p._id} className={`queue-row ${p._id === appt._id ? "my-row" : ""}`}>
            <b>T-{p.tokenNumber || i + 1} {p._id === appt._id ? "(You)" : p.patientName}</b>
            <div className="sub">
              Age: {p.patientAge} | {p.patientProblem}
            </div>
            <span className="tag">{p.priorityType}</span>
          </div>
        ))}
      </div>

      {/* 🚨 EMERGENCY SLIDE */}
      {emergency && !showGP && (
        <div className="right-slide">
          <h3>🚨 Doctor went to emergency surgery</h3>
          <button onClick={() => setShowGP(true)}>
            Consult Junior Doctor
          </button>
          <button onClick={() => setEmergency(false)}>Wait</button>
        </div>
      )}

      {showGP && (
        <div className="right-slide">
          <h3>Select Junior Doctor</h3>
          {JUNIOR_DOCTORS.map((gp) => (
            <button key={gp.id} onClick={() => transfer(gp)}>
              {gp.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}