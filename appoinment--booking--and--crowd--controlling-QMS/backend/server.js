import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import http from "http";
import { Server } from "socket.io";
import Appointment from "./models/Appointment.js";
import ConsultationHistory from "./models/ConsultationHistory.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(cors());
app.use(express.json());

// ================= MONGODB =================
mongoose
  .connect(
    "mongodb+srv://smartqueue:smartqueue744@cluster0.0vqlsb9.mongodb.net/smartqueue"
  )
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ Mongo error", err));

// ================= SOCKET =================
io.on("connection", (socket) => {
  console.log("🟢 Socket connected:", socket.id);
});

const emitUpdate = () => io.emit("QUEUE_UPDATE");

// ================= BOOK =================
app.post("/queue/book", async (req, res) => {
  try {
    const existing = await Appointment.findOne({
      patientId: req.body.patientId,
      status: { $ne: "COMPLETED" },
    });

    if (existing) {
      return res.json({ success: true, appointment: existing });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date();
    endOfDay.setHours(23,59,59,999);

    const todayCount = await Appointment.countDocuments({
      doctorId: req.body.doctorId,
      session: req.body.session,
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });

    const tokenNumber = todayCount + 1;

    // Mocking Room and Floor based on simple mapping
    const docIdNum = parseInt(String(req.body.doctorId || "1").replace(/\D/g, '') || "1");
    const floors = ["Ground", "1st", "2nd", "3rd"];
    const docFloor = floors[docIdNum % floors.length] || "1st";
    const docRoom = `Room 10${(docIdNum % 9) + 1}`;

    const appt = await Appointment.create({
      ...req.body,
      status: "WAITING",
      tokenNumber,
      doctorRoom: docRoom,
      doctorFloor: docFloor
    });

    emitUpdate();
    res.json({ success: true, appointment: appt });
  } catch (error) {
    console.error("Booking Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ================= CHECK IN =================
app.post("/appointment/checkin", async (req, res) => {
  const { id } = req.body;
  const appt = await Appointment.findByIdAndUpdate(
    id,
    { isInsideHospital: true },
    { new: true }
  );
  emitUpdate();
  res.json({ success: true, appointment: appt });
});

// ================= PATIENT =================
app.get("/queue/patient/:uid", async (req, res) => {
  const appt = await Appointment.findOne({
    patientId: req.params.uid,
    status: { $in: ["WAITING", "IN_PROGRESS", "COMPLETED"] },
  }).sort({ createdAt: -1 });

  res.json({ appointment: appt });
});

// ================= DOCTOR QUEUE (PRIORITY ORDER) =================
app.get("/queue/doctor/:doctorId", async (req, res) => {
  const { session } = req.query;

  const queue = await Appointment.aggregate([
    {
      $match: {
        doctorId: req.params.doctorId,
        session,
        status: { $ne: "COMPLETED" },
      },
    },
    {
      $addFields: {
        priorityRank: {
          $switch: {
            branches: [
              { case: { $eq: ["$priorityType", "E1"] }, then: 1 },
              { case: { $eq: ["$priorityType", "E2"] }, then: 2 },
              { case: { $eq: ["$priorityType", "E3"] }, then: 3 },
            ],
            default: 4, // OPD
          },
        },
      },
    },
    {
      $sort: {
        priorityRank: 1,
        createdAt: 1,
      },
    },
  ]);

  res.json({ queue });
});

// ================= STATUS UPDATE =================
app.post("/appointment/status", async (req, res) => {
  const { id, status } = req.body;

  const appt = await Appointment.findByIdAndUpdate(
    id,
    { status },
    { new: true }
  );

  emitUpdate();

  // COPY TO HISTORY
  if (status === "COMPLETED" && appt) {
    await ConsultationHistory.create({
      patientId: appt.patientId,
      patientName: appt.patientName,
      patientAge: appt.patientAge,
      patientProblem: appt.patientProblem,
      doctorId: appt.doctorId,
      doctorName: appt.doctorName,
      priorityType: appt.priorityType,
      session: appt.session,
    });
  }

  res.json({ success: true });
});

// ================= EMERGENCY =================
app.post("/doctor/emergency", async (req, res) => {
  io.emit("DOCTOR_EMERGENCY");
  res.json({ success: true });
});

// ================= TRANSFER =================
app.post("/appointment/transfer", async (req, res) => {
  const { id, doctorId, doctorName } = req.body;

  await Appointment.findByIdAndUpdate(id, {
    doctorId,
    doctorName,
  });

  emitUpdate();
  res.json({ success: true });
});

// ================= OPD COUNT (NEW – SAFE ADDITION) =================
app.get("/queue/opd-count", async (req, res) => {
  try {
    const { doctorId, session, date } = req.query;

    if (!doctorId || !session || !date) {
      return res.status(400).json({
        success: false,
        message: "Missing parameters",
      });
    }

    const opdCount = await Appointment.countDocuments({
      doctorId,
      session,
      priorityType: "OPD",
      status: { $ne: "COMPLETED" },
      createdAt: {
        $gte: new Date(date + "T00:00:00.000Z"),
        $lte: new Date(date + "T23:59:59.999Z"),
      },
    });

    res.json({
      success: true,
      count: opdCount,
    });
  } catch (error) {
    console.error("❌ OPD count error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// ================= PATIENT HISTORY =================
app.get("/patient/history/:uid", async (req, res) => {
  try {
    const history = await Appointment.find({
      patientId: req.params.uid,
      status: "COMPLETED",
    }).sort({ updatedAt: -1 });

    res.json({ history });
  } catch (err) {
    res.status(500).json({ history: [] });
  }
});

// ================= SERVER =================
server.listen(5000, () =>
  console.log("🔥 Smart Queue backend + socket running on 5000")
);
