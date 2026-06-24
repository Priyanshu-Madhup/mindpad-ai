import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Crown, Tag, Check, ShieldCheck, User, Mail, Phone, MapPin, ChevronDown } from 'lucide-react';

// ── Country codes with flags ────────────────────────────────────────────────
const COUNTRY_CODES = [
  { code: 'IN', dial: '+91',  flag: '\uD83C\uDDEE\uD83C\uDDF3', name: 'India' },
  { code: 'US', dial: '+1',   flag: '\uD83C\uDDFA\uD83C\uDDF8', name: 'USA' },
  { code: 'GB', dial: '+44',  flag: '\uD83C\uDDEC\uD83C\uDDE7', name: 'UK' },
  { code: 'AU', dial: '+61',  flag: '\uD83C\uDDE6\uD83C\uDDFA', name: 'Australia' },
  { code: 'CA', dial: '+1',   flag: '\uD83C\uDDE8\uD83C\uDDE6', name: 'Canada' },
  { code: 'SG', dial: '+65',  flag: '\uD83C\uDDF8\uD83C\uDDEC', name: 'Singapore' },
  { code: 'AE', dial: '+971', flag: '\uD83C\uDDE6\uD83C\uDDEA', name: 'UAE' },
  { code: 'DE', dial: '+49',  flag: '\uD83C\uDDE9\uD83C\uDDEA', name: 'Germany' },
  { code: 'FR', dial: '+33',  flag: '\uD83C\uDDEB\uD83C\uDDF7', name: 'France' },
  { code: 'JP', dial: '+81',  flag: '\uD83C\uDDEF\uD83C\uDDF5', name: 'Japan' },
  { code: 'NZ', dial: '+64',  flag: '\uD83C\uDDF3\uD83C\uDDFF', name: 'New Zealand' },
  { code: 'ZA', dial: '+27',  flag: '\uD83C\uDDFF\uD83C\uDDE6', name: 'South Africa' },
];

// ── India states ────────────────────────────────────────────────────────────
const INDIA_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan',
  'Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Andaman & Nicobar Islands','Chandigarh','Dadra & Nagar Haveli and Daman & Diu',
  'Delhi','Jammu & Kashmir','Ladakh','Lakshadweep','Puducherry',
];

// ── Major cities per Indian state ───────────────────────────────────────────
const INDIA_CITIES = {
  'Andhra Pradesh': ['Visakhapatnam','Vijayawada','Guntur','Nellore','Kurnool','Tirupati','Kakinada','Rajahmundry'],
  'Arunachal Pradesh': ['Itanagar','Naharlagun','Pasighat','Tawang','Ziro'],
  'Assam': ['Guwahati','Silchar','Dibrugarh','Jorhat','Nagaon','Tinsukia','Tezpur','Bongaigaon'],
  'Bihar': ['Patna','Gaya','Bhagalpur','Muzaffarpur','Purnia','Darbhanga','Bihar Sharif','Arrah'],
  'Chhattisgarh': ['Raipur','Bhilai','Bilaspur','Korba','Durg','Rajnandgaon','Jagdalpur'],
  'Goa': ['Panaji','Margao','Vasco da Gama','Mapusa','Ponda'],
  'Gujarat': ['Ahmedabad','Surat','Vadodara','Rajkot','Bhavnagar','Jamnagar','Gandhinagar','Anand','Nadiad'],
  'Haryana': ['Faridabad','Gurugram','Panipat','Ambala','Yamunanagar','Rohtak','Hisar','Karnal','Sonipat'],
  'Himachal Pradesh': ['Shimla','Dharamsala','Solan','Mandi','Baddi','Nahan','Palampur'],
  'Jharkhand': ['Ranchi','Jamshedpur','Dhanbad','Bokaro','Deoghar','Hazaribagh','Giridih'],
  'Karnataka': ['Bengaluru','Mysuru','Mangaluru','Hubballi','Belagavi','Kalaburagi','Davanagere','Ballari','Vijayapura'],
  'Kerala': ['Thiruvananthapuram','Kochi','Kozhikode','Thrissur','Kollam','Palakkad','Alappuzha','Kannur','Kottayam'],
  'Madhya Pradesh': ['Bhopal','Indore','Jabalpur','Gwalior','Ujjain','Sagar','Dewas','Satna','Ratlam'],
  'Maharashtra': ['Mumbai','Pune','Nagpur','Thane','Nashik','Aurangabad','Solapur','Kolhapur','Amravati','Navi Mumbai'],
  'Manipur': ['Imphal','Thoubal','Bishnupur','Churachandpur'],
  'Meghalaya': ['Shillong','Tura','Nongstoin','Jowai'],
  'Mizoram': ['Aizawl','Lunglei','Champhai','Serchhip'],
  'Nagaland': ['Kohima','Dimapur','Mokokchung','Tuensang'],
  'Odisha': ['Bhubaneswar','Cuttack','Rourkela','Berhampur','Sambalpur','Puri','Balasore','Bhadrak'],
  'Punjab': ['Ludhiana','Amritsar','Jalandhar','Patiala','Bathinda','Mohali','Firozpur','Hoshiarpur'],
  'Rajasthan': ['Jaipur','Jodhpur','Udaipur','Ajmer','Kota','Bikaner','Alwar','Bharatpur','Sikar'],
  'Sikkim': ['Gangtok','Namchi','Gyalshing','Mangan'],
  'Tamil Nadu': ['Chennai','Coimbatore','Madurai','Tiruchirappalli','Salem','Tirunelveli','Vellore','Erode','Tiruppur','Dindigul'],
  'Telangana': ['Hyderabad','Warangal','Nizamabad','Karimnagar','Khammam','Ramagundam','Mahbubnagar'],
  'Tripura': ['Agartala','Dharmanagar','Udaipur','Kailasahar'],
  'Uttar Pradesh': ['Lucknow','Kanpur','Agra','Varanasi','Meerut','Prayagraj','Ghaziabad','Noida','Mathura','Bareilly','Aligarh'],
  'Uttarakhand': ['Dehradun','Haridwar','Roorkee','Haldwani','Rudrapur','Kashipur','Rishikesh'],
  'West Bengal': ['Kolkata','Howrah','Durgapur','Asansol','Siliguri','Bardhaman','Malda','Kharagpur'],
  'Delhi': ['New Delhi','Central Delhi','North Delhi','South Delhi','East Delhi','West Delhi','Dwarka','Rohini'],
  'Chandigarh': ['Chandigarh'],
  'Puducherry': ['Puducherry','Karaikal','Mahe','Yanam'],
  'Jammu & Kashmir': ['Srinagar','Jammu','Anantnag','Baramulla','Sopore','Kathua'],
  'Ladakh': ['Leh','Kargil'],
  'Andaman & Nicobar Islands': ['Port Blair','Car Nicobar','Rangat'],
  'Dadra & Nagar Haveli and Daman & Diu': ['Daman','Diu','Silvassa'],
  'Lakshadweep': ['Kavaratti','Agatti','Amini'],
};

const PLANS = {
  free: {
    label: 'Free', price: 0, storage: '50 MB', model: 'Standard AI', studio: 'Basic access',
    features: ['Unlimited notebooks', 'AI Chat (Midy AI)', 'PDF upload & smart search', 'Voice input & text-to-speech', 'Web search'],
  },
  plus: {
    label: 'Plus', price: 49, storage: '200 MB', model: 'Better AI (2×)', studio: 'Expanded access',
    features: ['Everything in Free', 'Deep Research (unlimited)', 'AI image generation (50/day)', '12 languages', 'Mind Map + Insight Canvas', 'Priority support'],
  },
  pro: {
    label: 'Pro', price: 99, storage: '500 MB', model: 'Best AI (3×)', studio: 'Full access',
    features: ['Everything in Plus', 'AI image generation (unlimited)', 'Full AI Studio access', 'Notion integration', 'Dedicated support', 'Early access to features'],
  },
};

const INPUT = 'w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 dark:focus:border-slate-500 transition';

export default function PaymentPage({ plan, onBack }) {
  const p = PLANS[plan?.id] ?? PLANS.plus;

  const [form, setForm] = useState({
    name: '', email: '',
    dialCode: 'IN', phone: '',
    address: '', country: 'IN', state: '', city: '', zip: '',
    coupon: '', agreed: false,
  });
  const [couponState, setCouponState] = useState('idle');
  const [discount, setDiscount] = useState(0);
  const [couponError, setCouponError] = useState('');

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  // When country changes, reset state+city
  const handleCountryChange = (e) => {
    setForm((prev) => ({ ...prev, country: e.target.value, state: '', city: '' }));
  };
  // When state changes, reset city
  const handleStateChange = (e) => {
    setForm((prev) => ({ ...prev, state: e.target.value, city: '' }));
  };

  const isIndia    = form.country === 'IN';
  const stateList  = isIndia ? INDIA_STATES : [];
  const cityList   = useMemo(() => (isIndia && form.state ? INDIA_CITIES[form.state] || [] : []), [form.country, form.state]);

  const selectedDial = COUNTRY_CODES.find((c) => c.code === form.dialCode) || COUNTRY_CODES[0];

  const applyCoupon = async () => {
    if (!form.coupon.trim()) return;
    setCouponState('loading');
    setCouponError('');
    await new Promise((r) => setTimeout(r, 700));
    if (form.coupon.trim().toUpperCase() === 'MINDPAD20') {
      setDiscount(20);
      setCouponState('valid');
    } else {
      setDiscount(0);
      setCouponState('invalid');
      setCouponError('Invalid or expired coupon code.');
    }
  };

  const basePrice   = p.price;
  const discountAmt = Math.round(basePrice * discount / 100);
  const finalPrice  = basePrice - discountAmt;

  const handleSubmit = (e) => {
    e.preventDefault();
    // Billing details collected — hand off to Razorpay payment gateway
    alert('Redirecting to payment gateway (Razorpay integration coming soon).');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">

      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to plans
        </button>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
          <ShieldCheck className="w-3.5 h-3.5" />
          SSL Encrypted &mdash; Secure Checkout
        </div>
      </div>

      {/* Main grid */}
      <div className="max-w-4xl mx-auto px-4 py-10 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">

        {/* ── Left: Checkout form ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <h1 className="text-xl font-bold font-display text-slate-900 dark:text-white mb-6">Checkout</h1>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Personal details */}
            <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-800 dark:text-white">Personal Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <User className="w-3 h-3" /> Full name <span className="text-red-400">*</span>
                  </label>
                  <input required type="text" placeholder="Your full name" value={form.name} onChange={set('name')} className={INPUT} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Mail className="w-3 h-3" /> Email address <span className="text-red-400">*</span>
                  </label>
                  <input required type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} className={INPUT} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Phone className="w-3 h-3" /> Phone number <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-2">
                  {/* Country code + flag picker */}
                  <div className="relative shrink-0">
                    <select
                      value={form.dialCode}
                      onChange={(e) => setForm((prev) => ({ ...prev, dialCode: e.target.value }))}
                      className="appearance-none pl-2 pr-7 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition cursor-pointer"
                    >
                      {COUNTRY_CODES.map((c) => (
                        <option key={c.code} value={c.code}>{c.flag} {c.dial}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                  </div>
                  {/* Flag display + number input */}
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base select-none pointer-events-none">{selectedDial.flag}</span>
                    <input
                      required type="tel"
                      placeholder="98765 43210"
                      value={form.phone}
                      onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value.replace(/[^\d\s\-]/g, '').slice(0, 15) }))}
                      className={`${INPUT} pl-10`}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Billing address */}
            <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400" /> Billing Address
              </h2>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Street address <span className="text-red-400">*</span></label>
                <input required type="text" placeholder="123, MG Road" value={form.address} onChange={set('address')} className={INPUT} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Country <span className="text-red-400">*</span></label>
                <div className="relative">
                  <select required value={form.country} onChange={handleCountryChange} className={`${INPUT} appearance-none pr-8`}>
                    <option value="">Choose country</option>
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                    ))}
                    <option value="other">Other</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {/* State — dropdown for India, free text otherwise */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">State <span className="text-red-400">*</span></label>
                  {isIndia ? (
                    <div className="relative">
                      <select required value={form.state} onChange={handleStateChange} className={`${INPUT} appearance-none pr-8`}>
                        <option value="">Select state</option>
                        {stateList.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    </div>
                  ) : (
                    <input required type="text" placeholder="State" value={form.state} onChange={set('state')} className={INPUT} />
                  )}
                </div>
                {/* City — dropdown when India + state chosen, free text otherwise */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">City <span className="text-red-400">*</span></label>
                  {isIndia && cityList.length > 0 ? (
                    <div className="relative">
                      <select required value={form.city} onChange={set('city')} className={`${INPUT} appearance-none pr-8`}>
                        <option value="">Select city</option>
                        {cityList.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    </div>
                  ) : (
                    <input required type="text" placeholder="City" value={form.city} onChange={set('city')} className={INPUT} />
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">ZIP / PIN <span className="text-red-400">*</span></label>
                  <input required type="text" inputMode="numeric" placeholder="400001" value={form.zip} onChange={set('zip')} className={INPUT} />
                </div>
              </div>
            </section>

            {/* Terms */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.agreed}
                onChange={(e) => setForm((prev) => ({ ...prev, agreed: e.target.checked }))}
                className="mt-0.5 w-4 h-4 accent-primary rounded cursor-pointer shrink-0"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                I have read and agree to the{' '}
                <span className="text-primary dark:text-slate-200 font-medium underline underline-offset-2 cursor-pointer">Terms of Service</span>
                {' '}and{' '}
                <span className="text-primary dark:text-slate-200 font-medium underline underline-offset-2 cursor-pointer">Privacy Policy</span>.
                {' '}Subscription renews monthly and can be cancelled anytime.
              </span>
            </label>

            {/* Submit — hands off to Razorpay */}
            <button
              type="submit"
              disabled={!form.agreed}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white bg-primary dark:bg-white dark:text-slate-900 hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {finalPrice === 0 ? 'Continue for free' : `Proceed to Pay ₹${finalPrice} / month`}
            </button>

            <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3 h-3" />
              Card details are securely collected by our payment partner. We never store card information.
            </p>

          </form>
        </motion.div>

        {/* ── Right: Order summary ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.08 }}
        >
          <h1 className="text-xl font-bold font-display text-slate-900 dark:text-white mb-6">Review your plan</h1>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">

            {/* Plan header */}
            <div className="px-5 py-4 bg-primary/5 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 dark:bg-slate-700 flex items-center justify-center shrink-0">
                <Crown className="w-4 h-4 text-primary dark:text-slate-300" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 font-medium">Selected plan</p>
                <p className="text-sm font-bold font-display text-slate-900 dark:text-white">Mindpad AI {p.label}</p>
              </div>
            </div>

            {/* Included features */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 space-y-2">
              {p.features.map((feat, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <Check className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                  {feat}
                </div>
              ))}
            </div>

            {/* Plan specs */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 space-y-2.5 text-xs">
              {[['Storage', p.storage], ['AI Model', p.model], ['AI Studio', p.studio]].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-slate-400 dark:text-slate-500">{k}</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">{v}</span>
                </div>
              ))}
            </div>

            {/* Discount code */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 space-y-2.5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Tag className="w-3 h-3" /> Discount code
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter code"
                  value={form.coupon}
                  onChange={set('coupon')}
                  disabled={couponState === 'valid'}
                  className={`${INPUT} flex-1 disabled:opacity-50 text-xs py-2`}
                />
                <button
                  type="button"
                  onClick={applyCoupon}
                  disabled={couponState === 'valid' || couponState === 'loading' || !form.coupon.trim()}
                  className="px-3.5 py-2 rounded-lg text-xs font-bold bg-slate-900 dark:bg-slate-200 text-white dark:text-slate-900 hover:opacity-80 transition disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {couponState === 'loading' ? '...' : couponState === 'valid' ? 'Applied' : 'Apply'}
                </button>
              </div>
              {couponState === 'valid' && (
                <p className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <Check className="w-3 h-3" /> {discount}% discount applied
                </p>
              )}
              {couponState === 'invalid' && (
                <p className="text-[11px] text-red-500 dark:text-red-400">{couponError}</p>
              )}
            </div>

            {/* Pricing breakdown */}
            <div className="px-5 py-4 space-y-2.5 text-xs">
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Subtotal</span>
                <span>&#8377;{basePrice}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Discount ({discount}%)</span>
                  <span>-&#8377;{discountAmt}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm text-slate-900 dark:text-white pt-2.5 mt-1 border-t border-slate-100 dark:border-slate-800">
                <span>Total</span>
                <span>&#8377;{finalPrice} <span className="text-xs font-normal text-slate-400">/ mo</span></span>
              </div>
            </div>

          </div>

          <p className="mt-4 text-center text-[11px] text-slate-400 dark:text-slate-500">
            Cancel anytime &middot; No hidden fees &middot; Billed monthly
          </p>
        </motion.div>

      </div>
    </div>
  );
}
