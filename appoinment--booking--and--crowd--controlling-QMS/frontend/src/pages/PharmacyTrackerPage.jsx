import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import "./PharmacyTrackerPage.css";

import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

const API = "http://localhost:5000";
const socket = io(API);

export default function PharmacyTrackerPage() {
  const [user, setUser] = useState(null);
  const [order, setOrder] = useState(null);
  const [prescription, setPrescription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);

  const fetchMyData = async (uid) => {
    try {
      // 1. Fetch Latest Prescription
      const pRes = await fetch(`${API}/patient/latest-prescription/${uid}`);
      const pData = await pRes.json();
      if (pData.success && pData.history) {
        setPrescription(pData.history);
      }

      // 2. Fetch Active Order
      const res = await fetch(`${API}/pharmacy/orders`);
      const data = await res.json();
      if (data.success && data.orders.length > 0) {
        const myOrd = data.orders.find(o => o.patientId === uid);
        setOrder(myOrd || null);
      }
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        fetchMyData(u.uid);
      } else {
        setLoading(false);
      }
    });

    socket.on("PATIENT_PHARMACY_UPDATE", (data) => {
      if (user && data.patientId === user.uid) {
         setOrder(data.order);
      }
    });

    return () => {
       unsub();
       socket.off("PATIENT_PHARMACY_UPDATE");
    };
  }, [user?.uid]);

  const requestMedicines = async () => {
    if (!prescription || !user) return;
    try {
      const res = await fetch(`${API}/pharmacy/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
           patientId: user.uid,
           patientName: prescription.patientName || user.email,
           medicines: prescription.medicines || [],
           deliveryMethod: "Room Delivery"
        })
      });
      const data = await res.json();
      if (data.success) {
         setOrder(data.order);
      }
    } catch (err) {
      alert("Failed to order meds");
    }
  };

  const processPayment = async () => {
    setIsPaying(true);
    // Simulate UPI/Gateway delay
    setTimeout(async () => {
       await fetch(`${API}/payment/pay`, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ orderId: order._id })
       });
       setIsPaying(false);
    }, 2000);
  };

  if (loading) return <div className="pharmacy-tracker-wrapper">Loading...</div>;

  return (
    <div className="pharmacy-tracker-wrapper">
      <div className="tracker-card">
        <h2>💊 Smart Medicine Delivery</h2>
        <p className="subtitle">Zero Queue Pharmacy</p>

        {!order ? (
           <div className="no-order-view">
              {prescription && prescription.medicines && prescription.medicines.length > 0 ? (
                <>
                  <div className="prescription-mock">
                     <h4>Dr. {prescription.doctorName}'s Prescription</h4>
                     <ul>
                       {prescription.medicines.map((med, idx) => (
                         <li key={idx}>{med}</li>
                       ))}
                     </ul>
                  </div>
                  <p>Skip the pharmacy queue and order directly to your ward.</p>
                  <button className="btn-order-huge pulse-btn" onClick={requestMedicines}>
                     Order Medicines Now 🚀
                  </button>
                </>
              ) : (
                <div className="prescription-mock">
                   <h4>No active prescriptions found</h4>
                   <p>Consult a doctor to get a prescription.</p>
                </div>
              )}
           </div>
        ) : (
           <div className="active-order-view">
              {/* Stepper */}
              <div className="stepper-ui">
                 <div className={`step ${['Requested','Processing','Ready','Delivered'].includes(order.status) ? 'active' : ''}`}>1. Requested</div>
                 <div className={`step-line ${['Processing','Ready','Delivered'].includes(order.status) ? 'active' : ''}`}></div>
                 <div className={`step ${['Processing','Ready','Delivered'].includes(order.status) ? 'active' : ''}`}>2. Bill & Pay</div>
                 <div className={`step-line ${['Ready','Delivered'].includes(order.status) ? 'active' : ''}`}></div>
                 <div className={`step ${['Ready','Delivered'].includes(order.status) ? 'active' : ''}`}>3. Packing</div>
                 <div className={`step-line ${['Delivered'].includes(order.status) ? 'active' : ''}`}></div>
                 <div className={`step ${order.status === 'Delivered' ? 'active' : ''}`}>4. Delivered</div>
              </div>

              {/* Status Modules */}
              <div className="status-jumbotron">
                 {order.status === "Requested" && (
                    <div className="status-msg">
                       <span className="spinner">⌛</span>
                       <h3>Pharmacy is analyzing your prescription...</h3>
                       <p>We will generate your bill shortly.</p>
                    </div>
                 )}

                 {order.status === "Processing" && order.paymentStatus === "Pending" && (
                    <div className="payment-gateway">
                       <div className="bill-card">
                          <h3>Total Bill Amount</h3>
                          <h1>₹{order.billAmount}</h1>
                          <p>Order ID: {order._id.slice(-6).toUpperCase()}</p>
                       </div>
                       <button 
                          className={`btn-pay-now ${isPaying ? 'paying' : ''}`} 
                          onClick={processPayment} 
                          disabled={isPaying}>
                          {isPaying ? "Processing UPI..." : "Pay Securely via UPI 🛡️"}
                       </button>
                    </div>
                 )}

                 {(order.status === "Ready" || order.status === "Delivered") && (
                    <div className="status-msg success-anim">
                       {order.status === "Ready" ? (
                         <h1 style={{fontSize: "50px", margin: "10px"}}>✅</h1>
                       ) : (
                         <h1 style={{fontSize: "50px", margin: "10px"}}>📦</h1>
                       )}
                       
                       <h3>{order.status === "Ready" ? "Payment Successful!" : "Delivered!"}</h3>
                       <p>{order.status === "Ready" ? `Your medicines are packed and ready for ${order.deliveryMethod}.` : "Your medicines have been delivered. Get well soon!"}</p>
                       
                       {/* Digital Receipt */}
                       <div className="digital-receipt" style={{marginTop:"20px", background:"#f8fafc", padding:"15px", borderRadius:"10px", textAlign:"left", border:"1px dashed #cbd5e1"}}>
                          <h4 style={{margin:"0 0 10px 0", color:"#334155", textAlign:"center"}}>🧾 Digital Receipt</h4>
                          <p style={{margin:"5px 0", color:"#475569"}}><strong>Patient:</strong> {order.patientName}</p>
                          <p style={{margin:"5px 0", color:"#475569"}}><strong>Order ID:</strong> {order._id.slice(-6).toUpperCase()}</p>
                          <hr style={{borderTop:"1px dashed #cbd5e1", margin:"10px 0"}}/>
                          <p style={{margin:"5px 0", color:"#0f172a", fontSize:"18px"}}><strong>Total Paid:</strong> ₹{order.billAmount}</p>
                          <p style={{margin:"5px 0", color:"#16a34a", fontWeight:"bold"}}>Status: PAID ONLINE ✅</p>
                       </div>
                    </div>
                 )}
              </div>
           </div>
        )}
      </div>
    </div>
  );
}
