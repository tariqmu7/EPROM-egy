import React, { useState, useEffect } from 'react';

const PricingCalculator: React.FC = () => {
  // Input states
  const [courseName, setCourseName] = useState('Standard Technical Course');
  const [instructorRate, setInstructorRate] = useState(3000);
  const [days, setDays] = useState(5);
  const [hoursPerDay, setHoursPerDay] = useState(6);
  const [participants, setParticipants] = useState(12);
  const [locationMultiplier, setLocationMultiplier] = useState(1.0);
  const [materialsCost, setMaterialsCost] = useState(600);
  const [venueCost, setVenueCost] = useState(1000);
  const [clientDiscount, setClientDiscount] = useState(15);
  const [certificationFee, setCertificationFee] = useState(2000);

  // Result states
  const [totalPrice, setTotalPrice] = useState(0);
  const [perPersonPrice, setPerPersonPrice] = useState(0);

  useEffect(() => {
    // 1. Calculate Instructor Cost
    const dailyRate = instructorRate * hoursPerDay;
    const instructorTotal = dailyRate * days * locationMultiplier;

    // 2. Calculate Materials & Certs
    const materialsTotal = materialsCost * participants;
    const certsTotal = certificationFee * participants;

    // 3. Calculate Venue
    const venueTotal = venueCost * days;

    // 4. Subtotal
    const subtotal = instructorTotal + materialsTotal + certsTotal + venueTotal;

    // 5. Group Size Modifier (simplified logic for demonstration)
    const groupModifier =
      participants <= 3  ? 1.5  :
      participants <= 6  ? 1.2  :
      participants <= 12 ? 1.0  :
      participants <= 18 ? 0.9  :
      participants <= 25 ? 0.85 : 0.8;

    const groupAdjusted = subtotal * groupModifier;

    // 6. Discount
    const finalPrice = groupAdjusted * (1 - clientDiscount / 100);

    setTotalPrice(Math.round(finalPrice));
    setPerPersonPrice(Math.round(finalPrice / participants));
  }, [
    instructorRate,
    days,
    hoursPerDay,
    participants,
    locationMultiplier,
    materialsCost,
    venueCost,
    clientDiscount,
    certificationFee,
  ]);

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-lg border border-gray-100">
      <div className="border-b border-gray-200 pb-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-800">EPROM Training Pricing Calculator</h2>
        <p className="text-gray-500">Interactive calculator for course pricing estimations.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* INPUTS COLUMN */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-700 mb-3 border-b pb-2">Parameters</h3>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Course Name</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Instructor Hr Rate (EGP)</label>
              <input
                type="number"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={instructorRate}
                onChange={(e) => setInstructorRate(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location Multiplier</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={locationMultiplier}
                onChange={(e) => setLocationMultiplier(Number(e.target.value))}
              >
                <option value={1.0}>Alexandria HQ (1.0x)</option>
                <option value={1.05}>Alexandria Local (1.05x)</option>
                <option value={1.15}>Cairo (1.15x)</option>
                <option value={1.25}>On-Site Cairo (1.25x)</option>
                <option value={1.5}>Offshore (1.5x)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Days</label>
              <input
                type="number"
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Participants</label>
              <input
                type="number"
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={participants}
                onChange={(e) => setParticipants(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Materials / Person</label>
              <input
                type="number"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={materialsCost}
                onChange={(e) => setMaterialsCost(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cert Fee / Person</label>
              <input
                type="number"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={certificationFee}
                onChange={(e) => setCertificationFee(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Venue Surcharge / Day</label>
              <input
                type="number"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={venueCost}
                onChange={(e) => setVenueCost(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client Discount (%)</label>
              <input
                type="number"
                max="100"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={clientDiscount}
                onChange={(e) => setClientDiscount(Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* RESULTS COLUMN */}
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 flex flex-col justify-center">
          <div className="text-center mb-8">
            <h3 className="text-sm uppercase tracking-wider text-gray-500 font-semibold mb-2">Total Course Price</h3>
            <div className="text-5xl font-extrabold text-blue-900">
              EGP {totalPrice.toLocaleString()}
            </div>
            <div className="mt-2 text-sm text-gray-500">For {participants} participants ({days} days)</div>
          </div>

          <div className="text-center mb-6">
            <h3 className="text-sm uppercase tracking-wider text-gray-500 font-semibold mb-2">Per Participant Price</h3>
            <div className="text-4xl font-bold text-blue-600">
              EGP {perPersonPrice.toLocaleString()}
            </div>
            <div className="mt-2 text-sm text-gray-500">Includes materials & certification</div>
          </div>

          <div className="mt-auto pt-6 border-t border-gray-200">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Course:</span>
              <span className="font-medium text-gray-800">{courseName}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Location:</span>
              <span className="font-medium text-gray-800">{locationMultiplier}x Multiplier</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Discount Applied:</span>
              <span className="font-medium text-green-600">-{clientDiscount}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingCalculator;
