/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Sprout, 
  ClipboardList, 
  Bell, 
  BarChart3, 
  Plus, 
  LogOut, 
  LogIn, 
  Trash2, 
  CheckCircle2, 
  Circle, 
  Calendar, 
  MapPin, 
  Info,
  Droplets,
  Zap,
  Bug,
  Scissors,
  Wheat,
  MoreHorizontal,
  ChevronRight,
  Menu,
  X,
  MessageSquare,
  Send,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  doc, 
  collection, 
  setDoc, 
  getDoc,
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  Timestamp,
  FirebaseUser,
  OperationType,
  handleFirestoreError
} from './firebase';
import { format, addDays, isAfter, isBefore, startOfDay } from 'date-fns';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  createdAt: string;
}

interface Crop {
  id: string;
  name: string;
  variety?: string;
  plantingDate: Timestamp;
  expectedHarvestDate?: Timestamp;
  status: 'active' | 'harvested' | 'failed';
  location?: string;
  notes?: string;
}

interface Activity {
  id: string;
  cropId: string;
  type: 'watering' | 'fertilizing' | 'pest_control' | 'pruning' | 'harvesting' | 'other';
  date: Timestamp;
  notes?: string;
  cost?: number;
}

interface Reminder {
  id: string;
  title: string;
  description?: string;
  dueDate: Timestamp;
  completed: boolean;
  cropId?: string;
}

// --- Components ---

const SidebarItem = ({ 
  icon: Icon, 
  label, 
  active, 
  onClick 
}: { 
  icon: any, 
  label: string, 
  active: boolean, 
  onClick: () => void 
}) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all duration-200",
      active 
        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200" 
        : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
    )}
  >
    <Icon size={20} />
    <span className="font-medium">{label}</span>
  </button>
);

const Card = ({ children, className }: { children: React.ReactNode, className?: string, key?: string | number }) => (
  <div className={cn("bg-white rounded-2xl border border-slate-100 shadow-sm p-6", className)}>
    {children}
  </div>
);

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className,
  disabled
}: { 
  children: React.ReactNode, 
  onClick?: () => void, 
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost',
  className?: string,
  disabled?: boolean
}) => {
  const variants = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
    secondary: "bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50",
    danger: "bg-rose-50 text-rose-600 hover:bg-rose-100",
    ghost: "text-slate-500 hover:bg-slate-100"
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-4 py-2 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
};

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
        >
          <div className="px-6 py-4 border-bottom border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
              <X size={20} className="text-slate-500" />
            </button>
          </div>
          <div className="p-6">
            {children}
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'crops' | 'activities' | 'reminders' | 'reports' | 'assistant'>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Data State
  const [crops, setCrops] = useState<Crop[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  // Assistant State
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Form States
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [selectedCropId, setSelectedCropId] = useState<string | null>(null);

  // Auth Effect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const userDoc = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(userDoc);
        if (!snap.exists()) {
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || 'Farmer',
            photoURL: firebaseUser.photoURL || '',
            createdAt: new Date().toISOString(),
          };
          await setDoc(userDoc, newProfile);
          setProfile(newProfile);
        } else {
          setProfile(snap.data() as UserProfile);
        }
      } else {
        setProfile(null);
      }
      setIsAuthReady(true);
    });
    return unsubscribe;
  }, []);

  // Data Sync Effect
  useEffect(() => {
    if (!user) {
      setCrops([]);
      setActivities([]);
      setReminders([]);
      return;
    }

    const cropsQuery = collection(db, 'users', user.uid, 'crops');
    const activitiesQuery = collection(db, 'users', user.uid, 'activities');
    const remindersQuery = collection(db, 'users', user.uid, 'reminders');

    const unsubCrops = onSnapshot(cropsQuery, (snap) => {
      setCrops(snap.docs.map(d => ({ id: d.id, ...d.data() } as Crop)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'crops'));

    const unsubActivities = onSnapshot(activitiesQuery, (snap) => {
      setActivities(snap.docs.map(d => ({ id: d.id, ...d.data() } as Activity)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'activities'));

    const unsubReminders = onSnapshot(remindersQuery, (snap) => {
      setReminders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reminder)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'reminders'));

    return () => {
      unsubCrops();
      unsubActivities();
      unsubReminders();
    };
  }, [user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = () => signOut(auth);

  // --- Actions ---

  const addCrop = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    const newCrop = {
      name: formData.get('name') as string,
      variety: formData.get('variety') as string,
      plantingDate: Timestamp.fromDate(new Date(formData.get('plantingDate') as string)),
      expectedHarvestDate: formData.get('harvestDate') ? Timestamp.fromDate(new Date(formData.get('harvestDate') as string)) : null,
      status: 'active',
      location: formData.get('location') as string,
      notes: formData.get('notes') as string,
    };
    try {
      await addDoc(collection(db, 'users', user.uid, 'crops'), newCrop);
      setIsCropModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'crops');
    }
  };

  const addActivity = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    const newActivity = {
      cropId: formData.get('cropId') as string,
      type: formData.get('type') as string,
      date: Timestamp.fromDate(new Date(formData.get('date') as string)),
      notes: formData.get('notes') as string,
      cost: parseFloat(formData.get('cost') as string) || 0,
    };
    try {
      await addDoc(collection(db, 'users', user.uid, 'activities'), newActivity);
      setIsActivityModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'activities');
    }
  };

  const addReminder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    const newReminder = {
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      dueDate: Timestamp.fromDate(new Date(formData.get('dueDate') as string)),
      completed: false,
      cropId: formData.get('cropId') as string || null,
    };
    try {
      await addDoc(collection(db, 'users', user.uid, 'reminders'), newReminder);
      setIsReminderModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'reminders');
    }
  };

  const toggleReminder = async (reminder: Reminder) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'reminders', reminder.id), {
        completed: !reminder.completed
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'reminders');
    }
  };

  const deleteItem = async (type: 'crops' | 'activities' | 'reminders', id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, type, id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, type);
    }
  };

  const handleAskAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsChatLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      const context = `
        Anda adalah asisten ahli pertanian hortikultura bernama TaniPintar.
        Data petani saat ini:
        - Jumlah tanaman aktif: ${activeCrops.length}
        - Daftar tanaman: ${activeCrops.map(c => `${c.name} (${c.variety || 'umum'})`).join(', ')}
        - Aktivitas terakhir: ${activities.slice(0, 5).map(a => `${a.type} pada ${format(a.date.toDate(), 'dd MMM')}`).join(', ')}
        
        Berikan saran praktis, solusi hama, atau tips perawatan berdasarkan data tersebut atau pertanyaan petani.
        Gunakan bahasa Indonesia yang ramah dan mudah dimengerti petani.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          { role: 'user', parts: [{ text: context }] },
          ...chatHistory.map(msg => ({ role: msg.role, parts: [{ text: msg.text }] })),
          { role: 'user', parts: [{ text: userMessage }] }
        ]
      });

      const aiText = response.text || "Maaf, saya sedang tidak bisa menjawab. Silakan coba lagi nanti.";
      setChatHistory(prev => [...prev, { role: 'model', text: aiText }]);
    } catch (error) {
      console.error("AI Error:", error);
      setChatHistory(prev => [...prev, { role: 'model', text: "Terjadi kesalahan saat menghubungi asisten. Pastikan koneksi internet Anda stabil." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // --- Computed Data ---

  const activeCrops = useMemo(() => crops.filter(c => c.status === 'active'), [crops]);
  const pendingReminders = useMemo(() => reminders.filter(r => !r.completed).sort((a, b) => a.dueDate.seconds - b.dueDate.seconds), [reminders]);
  
  const reportData = useMemo(() => {
    const activityCostsByType = activities.reduce((acc, curr) => {
      acc[curr.type] = (acc[curr.type] || 0) + (curr.cost || 0);
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(activityCostsByType).map(([name, value]) => ({ name, value }));
  }, [activities]);

  const costOverTime = useMemo(() => {
    const sorted = [...activities].sort((a, b) => a.date.seconds - b.date.seconds);
    const grouped = sorted.reduce((acc, curr) => {
      const day = format(curr.date.toDate(), 'MMM dd');
      acc[day] = (acc[day] || 0) + (curr.cost || 0);
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped).map(([name, cost]) => ({ name, cost }));
  }, [activities]);

  // --- Views ---

  const DashboardView = () => (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-emerald-50 border-emerald-100">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-600 text-white rounded-2xl">
              <Sprout size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-emerald-700">Tanaman Aktif</p>
              <h4 className="text-2xl font-bold text-emerald-900">{activeCrops.length}</h4>
            </div>
          </div>
        </Card>
        <Card className="bg-amber-50 border-amber-100">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500 text-white rounded-2xl">
              <Bell size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-amber-700">Pengingat Mendatang</p>
              <h4 className="text-2xl font-bold text-amber-900">{pendingReminders.length}</h4>
            </div>
          </div>
        </Card>
        <Card className="bg-blue-50 border-blue-100">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500 text-white rounded-2xl">
              <ClipboardList size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-700">Total Aktivitas</p>
              <h4 className="text-2xl font-bold text-blue-900">{activities.length}</h4>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800">Tanaman Terbaru</h3>
            <Button variant="ghost" onClick={() => setActiveTab('crops')}>Lihat Semua</Button>
          </div>
          <div className="space-y-4">
            {activeCrops.slice(0, 4).map(crop => (
              <div key={crop.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-50 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold">
                    {crop.name[0]}
                  </div>
                  <div>
                    <h5 className="font-semibold text-slate-800">{crop.name}</h5>
                    <p className="text-xs text-slate-500">{crop.variety} • Ditanam {format(crop.plantingDate.toDate(), 'dd MMM yyyy')}</p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-slate-300" />
              </div>
            ))}
            {activeCrops.length === 0 && <p className="text-center py-8 text-slate-400 italic">Belum ada tanaman aktif.</p>}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800">Tugas Hari Ini</h3>
            <Button variant="ghost" onClick={() => setActiveTab('reminders')}>Semua Tugas</Button>
          </div>
          <div className="space-y-4">
            {pendingReminders.slice(0, 4).map(reminder => (
              <div key={reminder.id} className="flex items-center gap-4 p-4 rounded-xl border border-slate-50">
                <button onClick={() => toggleReminder(reminder)} className="text-emerald-600 hover:scale-110 transition-transform">
                  <Circle size={20} />
                </button>
                <div className="flex-1">
                  <h5 className="font-semibold text-slate-800">{reminder.title}</h5>
                  <p className="text-xs text-slate-500">{format(reminder.dueDate.toDate(), 'HH:mm')} • {reminder.description}</p>
                </div>
              </div>
            ))}
            {pendingReminders.length === 0 && <p className="text-center py-8 text-slate-400 italic">Semua tugas selesai! 🎉</p>}
          </div>
        </Card>
      </div>
    </div>
  );

  const CropsView = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Manajemen Tanaman</h2>
        <Button onClick={() => setIsCropModalOpen(true)}>
          <Plus size={20} />
          Tambah Tanaman
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {crops.map(crop => (
          <Card key={crop.id} className="group relative overflow-hidden">
            <div className={cn(
              "absolute top-0 left-0 w-full h-1",
              crop.status === 'active' ? "bg-emerald-500" : crop.status === 'harvested' ? "bg-blue-500" : "bg-slate-400"
            )} />
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className="text-lg font-bold text-slate-800">{crop.name}</h4>
                <p className="text-sm text-slate-500">{crop.variety}</p>
              </div>
              <span className={cn(
                "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                crop.status === 'active' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
              )}>
                {crop.status}
              </span>
            </div>
            
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Calendar size={14} />
                <span>Ditanam: {format(crop.plantingDate.toDate(), 'dd MMM yyyy')}</span>
              </div>
              {crop.location && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <MapPin size={14} />
                  <span>{crop.location}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button 
                variant="secondary" 
                className="flex-1 text-xs" 
                onClick={() => {
                  setSelectedCropId(crop.id);
                  setIsActivityModalOpen(true);
                }}
              >
                Log Aktivitas
              </Button>
              <Button variant="danger" className="p-2" onClick={() => deleteItem('crops', crop.id)}>
                <Trash2 size={16} />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const ActivitiesView = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Log Aktivitas</h2>
        <Button onClick={() => setIsActivityModalOpen(true)}>
          <Plus size={20} />
          Catat Aktivitas
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tanggal</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tanaman</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tipe</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Biaya</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Catatan</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activities.sort((a, b) => b.date.seconds - a.date.seconds).map(activity => {
                const crop = crops.find(c => c.id === activity.cropId);
                return (
                  <tr key={activity.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm text-slate-600">{format(activity.date.toDate(), 'dd MMM yyyy')}</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-800">{crop?.name || 'Unknown'}</td>
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-2 text-sm text-slate-600 capitalize">
                        {activity.type === 'watering' && <Droplets size={14} className="text-blue-500" />}
                        {activity.type === 'fertilizing' && <Zap size={14} className="text-amber-500" />}
                        {activity.type === 'pest_control' && <Bug size={14} className="text-rose-500" />}
                        {activity.type === 'pruning' && <Scissors size={14} className="text-emerald-500" />}
                        {activity.type === 'harvesting' && <Wheat size={14} className="text-amber-600" />}
                        {activity.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">Rp {activity.cost?.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 max-w-xs truncate">{activity.notes}</td>
                    <td className="px-6 py-4">
                      <button onClick={() => deleteItem('activities', activity.id)} className="text-slate-300 hover:text-rose-500 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {activities.length === 0 && <div className="text-center py-12 text-slate-400 italic">Belum ada aktivitas tercatat.</div>}
        </div>
      </Card>
    </div>
  );

  const RemindersView = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Pengingat & Tugas</h2>
        <Button onClick={() => setIsReminderModalOpen(true)}>
          <Plus size={20} />
          Tambah Pengingat
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Mendatang</h3>
          {pendingReminders.map(reminder => (
            <Card key={reminder.id} className="flex items-start gap-4 hover:shadow-md transition-shadow">
              <button onClick={() => toggleReminder(reminder)} className="mt-1 text-slate-300 hover:text-emerald-500 transition-colors">
                <Circle size={24} />
              </button>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-slate-800">{reminder.title}</h4>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-1 rounded-full",
                    isBefore(reminder.dueDate.toDate(), new Date()) ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600"
                  )}>
                    {format(reminder.dueDate.toDate(), 'dd MMM')}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-1">{reminder.description}</p>
                {reminder.cropId && (
                  <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 bg-slate-50 rounded-lg text-[10px] font-medium text-slate-500">
                    <Sprout size={10} />
                    {crops.find(c => c.id === reminder.cropId)?.name}
                  </div>
                )}
              </div>
              <button onClick={() => deleteItem('reminders', reminder.id)} className="text-slate-200 hover:text-rose-500">
                <Trash2 size={16} />
              </button>
            </Card>
          ))}
          {pendingReminders.length === 0 && <p className="text-center py-12 text-slate-400 italic">Tidak ada tugas tertunda.</p>}
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Selesai</h3>
          {reminders.filter(r => r.completed).slice(0, 10).map(reminder => (
            <Card key={reminder.id} className="flex items-start gap-4 opacity-60 grayscale">
              <button onClick={() => toggleReminder(reminder)} className="mt-1 text-emerald-500">
                <CheckCircle2 size={24} />
              </button>
              <div className="flex-1">
                <h4 className="font-bold text-slate-800 line-through">{reminder.title}</h4>
                <p className="text-sm text-slate-500 line-through">{reminder.description}</p>
              </div>
              <button onClick={() => deleteItem('reminders', reminder.id)} className="text-slate-200 hover:text-rose-500">
                <Trash2 size={16} />
              </button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );

  const ReportsView = () => (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-slate-800">Analisis & Laporan</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <h3 className="text-lg font-bold text-slate-800 mb-6">Distribusi Biaya Operasional</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={reportData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {reportData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-bold text-slate-800 mb-6">Tren Pengeluaran (Harian)</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costOverTime}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar dataKey="cost" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="text-lg font-bold text-slate-800 mb-6">Ringkasan Tanaman</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="p-4 rounded-2xl bg-slate-50">
            <p className="text-xs font-bold text-slate-400 uppercase mb-1">Total Tanaman</p>
            <p className="text-2xl font-bold text-slate-800">{crops.length}</p>
          </div>
          <div className="p-4 rounded-2xl bg-emerald-50">
            <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Berhasil Panen</p>
            <p className="text-2xl font-bold text-emerald-700">{crops.filter(c => c.status === 'harvested').length}</p>
          </div>
          <div className="p-4 rounded-2xl bg-rose-50">
            <p className="text-xs font-bold text-rose-600 uppercase mb-1">Gagal</p>
            <p className="text-2xl font-bold text-rose-700">{crops.filter(c => c.status === 'failed').length}</p>
          </div>
          <div className="p-4 rounded-2xl bg-blue-50">
            <p className="text-xs font-bold text-blue-600 uppercase mb-1">Total Biaya</p>
            <p className="text-2xl font-bold text-blue-700">Rp {activities.reduce((a, b) => a + (b.cost || 0), 0).toLocaleString()}</p>
          </div>
        </div>
      </Card>
    </div>
  );

  const AssistantView = () => (
    <div className="max-w-4xl mx-auto h-[calc(100vh-12rem)] flex flex-col">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Tanya Ahli Tani</h2>
        <p className="text-slate-500">Konsultasikan masalah tanaman Anda dengan asisten cerdas kami.</p>
      </div>

      <Card className="flex-1 flex flex-col p-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {chatHistory.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                <Sparkles size={32} />
              </div>
              <div>
                <p className="font-bold text-slate-800">Halo, saya TaniPintar!</p>
                <p className="text-sm">Tanyakan apa saja tentang tanaman hortikultura Anda.</p>
              </div>
            </div>
          )}
          {chatHistory.map((msg, i) => (
            <div key={i} className={cn(
              "flex w-full",
              msg.role === 'user' ? "justify-end" : "justify-start"
            )}>
              <div className={cn(
                "max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed",
                msg.role === 'user' 
                  ? "bg-emerald-600 text-white rounded-tr-none" 
                  : "bg-slate-100 text-slate-800 rounded-tl-none"
              )}>
                {msg.text}
              </div>
            </div>
          ))}
          {isChatLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-100 p-4 rounded-2xl rounded-tl-none flex gap-1">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleAskAssistant} className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Tanyakan sesuatu... (contoh: Kenapa daun cabai saya keriting?)"
            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
          />
          <Button disabled={isChatLoading || !chatInput.trim()} className="px-6">
            <Send size={20} />
          </Button>
        </form>
      </Card>
    </div>
  );

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-emerald-50 flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-emerald-50 flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl shadow-emerald-200/50 p-10 text-center"
        >
          <div className="w-20 h-20 bg-emerald-600 text-white rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-emerald-200">
            <Sprout size={40} />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-3">TaniPintar</h1>
          <p className="text-slate-500 mb-10 leading-relaxed">
            Asisten cerdas untuk manajemen pertanian hortikultura Anda. Catat, pantau, dan tingkatkan hasil panen.
          </p>
          <Button onClick={handleLogin} className="w-full py-4 text-lg rounded-2xl">
            <LogIn size={20} />
            Masuk dengan Google
          </Button>
          <p className="mt-8 text-xs text-slate-400">
            Dengan masuk, Anda menyetujui Ketentuan Layanan kami.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-72 bg-white border-r border-slate-100 transition-transform duration-300 lg:translate-x-0",
        !isSidebarOpen && "-translate-x-full"
      )}>
        <div className="h-full flex flex-col p-6">
          <div className="flex items-center gap-3 mb-10 px-2">
            <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-100">
              <Sprout size={24} />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">TaniPintar</h1>
          </div>

          <nav className="flex-1 space-y-2">
            <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
            <SidebarItem icon={Sprout} label="Tanaman" active={activeTab === 'crops'} onClick={() => setActiveTab('crops')} />
            <SidebarItem icon={ClipboardList} label="Aktivitas" active={activeTab === 'activities'} onClick={() => setActiveTab('activities')} />
            <SidebarItem icon={Bell} label="Pengingat" active={activeTab === 'reminders'} onClick={() => setActiveTab('reminders')} />
            <SidebarItem icon={BarChart3} label="Laporan" active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} />
            <SidebarItem icon={Sparkles} label="Tanya Ahli" active={activeTab === 'assistant'} onClick={() => setActiveTab('assistant')} />
          </nav>

          <div className="mt-auto pt-6 border-t border-slate-100">
            <div className="flex items-center gap-3 mb-6 px-2">
              <img src={profile?.photoURL} alt="" className="w-10 h-10 rounded-full border-2 border-emerald-100" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{profile?.displayName}</p>
                <p className="text-xs text-slate-400 truncate">{profile?.email}</p>
              </div>
            </div>
            <Button variant="ghost" className="w-full justify-start text-rose-500 hover:bg-rose-50 hover:text-rose-600" onClick={handleLogout}>
              <LogOut size={20} />
              Keluar
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "flex-1 transition-all duration-300",
        isSidebarOpen ? "lg:ml-72" : "ml-0"
      )}>
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-100 px-8 py-4 flex items-center justify-between">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-100 rounded-xl lg:hidden">
            <Menu size={24} className="text-slate-600" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-400">Halaman /</span>
            <span className="text-sm font-bold text-slate-800 capitalize">{activeTab}</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 text-slate-400 hover:text-emerald-600 transition-colors">
              <Bell size={20} />
            </button>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && <DashboardView />}
              {activeTab === 'crops' && <CropsView />}
              {activeTab === 'activities' && <ActivitiesView />}
              {activeTab === 'reminders' && <RemindersView />}
              {activeTab === 'reports' && <ReportsView />}
              {activeTab === 'assistant' && <AssistantView />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Modals */}
      <Modal isOpen={isCropModalOpen} onClose={() => setIsCropModalOpen(false)} title="Tambah Tanaman Baru">
        <form onSubmit={addCrop} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nama Tanaman</label>
            <input name="name" required className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Contoh: Cabai Rawit" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Varietas</label>
            <input name="variety" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Contoh: Kaliber" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Tanggal Tanam</label>
              <input name="plantingDate" type="date" required className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Estimasi Panen</label>
              <input name="harvestDate" type="date" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Lokasi / Lahan</label>
            <input name="location" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Contoh: Blok A" />
          </div>
          <Button className="w-full py-4 mt-4">Simpan Tanaman</Button>
        </form>
      </Modal>

      <Modal isOpen={isActivityModalOpen} onClose={() => { setIsActivityModalOpen(false); setSelectedCropId(null); }} title="Catat Aktivitas Pertanian">
        <form onSubmit={addActivity} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Pilih Tanaman</label>
            <select name="cropId" required defaultValue={selectedCropId || ""} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none">
              <option value="" disabled>Pilih tanaman...</option>
              {crops.map(c => <option key={c.id} value={c.id}>{c.name} ({c.variety})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Tipe Aktivitas</label>
            <select name="type" required className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none">
              <option value="watering">Penyiraman</option>
              <option value="fertilizing">Pemupukan</option>
              <option value="pest_control">Pengendalian Hama</option>
              <option value="pruning">Pemangkasan</option>
              <option value="harvesting">Pemanenan</option>
              <option value="other">Lainnya</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Tanggal</label>
              <input name="date" type="date" required defaultValue={format(new Date(), 'yyyy-MM-dd')} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Biaya (Rp)</label>
              <input name="cost" type="number" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="0" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Catatan</label>
            <textarea name="notes" rows={3} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Detail aktivitas..." />
          </div>
          <Button className="w-full py-4 mt-4">Simpan Aktivitas</Button>
        </form>
      </Modal>

      <Modal isOpen={isReminderModalOpen} onClose={() => setIsReminderModalOpen(false)} title="Tambah Pengingat Baru">
        <form onSubmit={addReminder} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Judul Tugas</label>
            <input name="title" required className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Contoh: Semprot Fungisida" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Waktu Pelaksanaan</label>
            <input name="dueDate" type="datetime-local" required className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Terkait Tanaman (Opsional)</label>
            <select name="cropId" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none">
              <option value="">Tidak ada</option>
              {crops.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Keterangan</label>
            <textarea name="description" rows={2} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Detail tugas..." />
          </div>
          <Button className="w-full py-4 mt-4">Setel Pengingat</Button>
        </form>
      </Modal>
    </div>
  );
}
