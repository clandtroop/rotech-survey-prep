// Form schemas + helpers COPIED from rotech-semiannual (the Location
// Readiness / Semiannual App). Survey Prep needs the item labels to render a
// submitted assessment and export the same PDF that app produces.
//
// Source of truth: rotech-semiannual/src/components/forms/{OP541,OP512,JC427}Form.jsx
// If a form changes over there, re-copy the affected constants here.

export const OP512_ITEMS = [
  { id: '1', label: 'Work areas clean?' },
  { id: '2', label: 'Garbage and other wastes removed from work area?' },
  { id: '3', label: 'Housekeeping maintained?' },
  { id: '4', label: 'Eating area clean?' },
  { id: '5', label: 'Restrooms clean and sanitary?' },
  { id: '6', label: 'Aisles free from obstruction?' },
  { id: '7', label: 'Floor mats flat to the floor surface?' },
  { id: '8', label: 'All outlets grounded?' },
  { id: '9', label: 'Covers missing on electrical fuse and outlet boxes?' },
  { id: '10', label: '3 ft. clearance around all electrical panels, transformers, or other electrical apparatus?' },
  { id: '11', label: 'Any outlets appear to be overloaded?' },
  { id: '12', label: 'Space heaters/portable fans used in a safe manner (not used near flammables)?' },
  { id: '13', label: 'Any electrical cords worn or frayed?' },
  { id: '14', label: 'Building exits adequate, properly marked and lighted?' },
  { id: '15', label: 'Exits blocked?' },
  { id: '16', label: 'Emergency lighting checked monthly and documented on FDA 001?' },
  { id: '17', label: 'Fire extinguishers mounted in accessible locations?' },
  { id: '18', label: 'Fire extinguishers inspected annually by outside vendor; date documented on attached card?' },
  { id: '19', label: 'Monthly visual inspection of fire extinguishers completed and documented on back of each card?' },
  { id: '20', label: 'Employees completed mandatory annual training in fire extinguisher operation?' },
  { id: '21', label: 'Smoke alarms installed in immediate vicinity of employee areas?' },
  { id: '22', label: 'All smoke alarm batteries replaced every 6 months?' },
  { id: '23', label: 'Documentation of annual automatic fire alarm & sprinkler system inspection available?' },
  { id: '24', label: 'Mandatory annual fire drill conducted per policy 2.4.13; employee participation documented on OP 520?' },
  { id: '25', label: 'Identified and corrected any potential fire hazards?' },
  { id: '26', label: 'Ladders have safety feet, are free from sharp edges and splinters?' },
  { id: '27', label: 'Personal Protective Equipment (PPE) available where needed?' },
  { id: '28', label: 'PPE worn or used as required (steel-toed shoes, gloves, eye protection, ear protection)?' },
  { id: '29', label: 'First aid kits available and free of oral medications (e.g., aspirin)?' },
  { id: '30', label: 'All tools and equipment in good condition?' },
  { id: '31', label: 'Oxygen tools marked and kept separate from "general use" tools?' },
  { id: '32', label: 'All electrically operated tools properly grounded or double insulated?' },
];

export const OVERALL_FACILITY_ITEMS = [
  { id: '1.1.14', label: 'Joint Commission contact sign posted in public view (JC 434)' },
  { id: '1.1.4', label: 'All licenses, certificates, and permits to operate posted in area accessible patients. Clinician license(s) must be posted in lobby.' },
  { id: '1.1.12', label: 'Hours of operation are posted' },
  { id: '2.3.1', label: 'Posted front door assistance sign for equipment returns (OP 554)' },
  { id: '2.2.1', label: 'No Pets Allowed sign posted on/near entrance to facility (OP 555)' },
  { id: 'covid_signage', label: 'COVID-19 signage posted as required by protocol', noPolicy: true },
  { id: 'restroom_accessibility', label: 'Are restrooms handicap accessible? If not, post "No Public Restrooms" signage in lobby', noPolicy: true },
  { id: '2.4.2', label: '"No Firearms" signs hanging on/near front entrance to facility. (Must have an English and Spanish version.) (Some states have French)' },
  { id: '1.1.23', label: 'Patient Safety Goals Poster visible in location (JC 428)' },
  { id: '1.1.4a', label: 'Field Management Organization Chart posted (OP 201)' },
  { id: '2.2.4', label: 'Safety Culture Poster hung in employee area (RM 1246)' },
  { id: '2.4.14', label: 'Workplace Violence Prevention Plan (OP 524) posted in each employee work area' },
  { id: '2.4.13', label: 'Evacuation plan posted (includes smoke alarms, fire extinguishers & designated assembly point)' },
  { id: '2.4.13a', label: 'Smoke alarms present and checks documented (per manufacturer recommendation, weekly) on FDA 001 OR Annual Inspection of suppression system' },
  { id: '2.2.28', label: 'Temperature sensitive supplies stored per manufacturer requirement (e.g., NPWT foam kits stored ≤ 77° F; not in warehouse or vehicles)' },
  { id: '2.4.13b', label: 'Fire extinguisher present and monthly checks documented (hang tag)' },
  { id: '2.4.13c', label: 'Record of annual fire extinguisher recharge' },
  { id: '2.2.1a', label: 'Exits identified and accessible (no obstructions and able to exit without a key). If emergency lighting present, monthly checks documented on FDA 001' },
  { id: '6.4.2', label: 'Compliant with all HIPAA regulations' },
  { id: 'courier_services', label: 'Are any services provided by courier services (Roadie, MSI, Spoke Logistics, Gohtr, Dropoff)? If yes, list courier and services provided in comments', noPolicy: true },
  { id: '2.2.1b', label: 'Facility is clean and organized' },
  { id: '2.3.1a', label: 'Hand gel readily available for employees and patients in all areas of the location' },
  { id: '2.4.2a', label: 'Expired Mada Products removed (2 years from Manufacturer Date) hand gel, wipes, spray', helpModal: 'mada' },
  { id: '2.3.1b', label: 'Hand washing guidelines posted in all restrooms (OP 503)' },
  { id: '2.3.1c', label: 'Antimicrobial soap in restroom (non-refillable)' },
  { id: '2.2.1c', label: 'PPE and first aid kits (without expired products) available in location' },
];

export const WAREHOUSE_SPECIFIC_ITEMS = [
  { id: '2.2.5', label: 'Equipment managed in designated/segregated areas of warehouse (dirty, clean, service, quarantine, holding, patient ready, full & empty cylinders)' },
  { id: '2.2.10', label: 'Wheelchairs and POVs cleaned with Steri-Fab (Only required in CT, DE, IN, MA, OH, OK, PA, RI, TX, VA and WV)' },
  { id: '2.2.10a', label: 'OP 763 Disinfection Log completed documenting wheelchair cleaning (Only required in OH and PA)' },
  { id: '2.2.5a', label: 'Equipment is properly clear bagged & green tagged if patient ready' },
  { id: '2.2.5b', label: 'Dirty equipment is in non-clear bags & red tagged if not decontaminated in the field' },
  { id: '2.2.5c', label: 'Green tags are filled in correctly with maintenance date/initials' },
  { id: '2.2.5d', label: 'Red tags are filled in if equipment decontaminated or needs repair' },
  { id: '2.5.17', label: 'Oxygen cylinders are stored safely in location - NO FREE STANDING CYLINDERS' },
  { id: '2.5.17a', label: 'Warehouse Inventory Forms for cylinders (FDA 011) and LOX (FDA 023) are complete and accurate' },
  { id: '2.1.28', label: 'Rental equipment with battery back-up charging (Check all ventilators to verify preventative maintenance is not required)' },
  { id: '2.2.4a', label: 'Oxygen analyzer calibrated per mfg. guidelines. Self-calibrating analyzers (Maxtec Max 02) must be checked weekly, document on FDA 025' },
  { id: '2.2.5e', label: 'Apnea monitor simulator calibrated per mfg. guidelines' },
  { id: '2.4.2b', label: 'Expired products removed' },
  { id: '2.4.11', label: 'Secondary containers appropriately labeled (use RM 1239)' },
  { id: '2.2.10b', label: 'Approved disinfectant in cleaning area' },
  { id: '2.2.5f', label: '"Oxygen Only" tools are labeled and segregated' },
  { id: '2.2.1d', label: 'Eyewash present/updated - close proximity to cleaning area' },
  { id: '2.5.17b', label: '"No Smoking" signs posted (on entrances into oxygen storage area)' },
  { id: '2.5.17c', label: '"Authorized Personnel Only" signs posted (on entrances into oxygen storage area)' },
  { id: '2.4.15', label: 'Maintain OP 535 for all work areas at risk of reaching a temperature ≥ 87° F (≥ 80° F in MD and OR). Post form OP 536 in work areas at risk of reaching a temperature ≥ 87° F (≥ 80° F in MD and OR).' },
];

export const DOCUMENTATION_ITEMS = [
  { id: '1.1.22', label: 'Patient perception of care survey reports reviewed quarterly' },
  { id: '1.1.22a', label: 'Referral source perception of care survey reports reviewed annually' },
  { id: '1.1.22b', label: 'Metrics report printed from Tableau and reviewed monthly' },
  { id: '1.1.22c', label: '20 EMR audits (OP 540) completed semi-annually (12 month track record)' },
  { id: '2.1.53', label: 'Following all state requirements as per CL 302 State Clinical Requirements' },
  { id: '2.4.8', label: 'OSHA 300A Work Injury Report posted per regulation' },
  { id: '2.2.1e', label: 'Record of Facility Safety Inspection (OP 512) twice in last 12 months (recommend January & July) & annual fire drill documented' },
  { id: '2.4.13d', label: 'Emergency Action/Fire Prevention Plan completed (RM 1240)' },
  { id: '2.2.2', label: 'Emergency Preparedness Plan (EPP) completed/printed annually (OP525 - all pages)' },
  { id: '2.2.2a', label: 'Emergency Plan activation documented on OP 857 Emergency Documentation & Recovery' },
  { id: '2.2.2b', label: 'Priority Codes and Quadrants in eIntake under attributes' },
  { id: '1.1.25', label: 'Morning meeting conducted per policy, documented on OP 843 Morning Meeting Checklist' },
  { id: '2.2.3', label: 'SDS book available (data sheets alphabetized) to include: RM 1232 Hazardous Chemical Inventory List, RM 1234 Hazard Communication Program Training for each employee, RM 1238 PPE Hazard Assessment for each employee' },
  { id: '7.2', label: 'Personnel and medical files stored separately in a locked cabinet' },
  { id: '1.1.21', label: 'In-services are documented routinely (e.g., MMM Hit List, policy review, "Don\'t Bug Me" and Safety Matters newsletters, monthly safety meeting, new equipment, etc.) on OP 520 In-Service Attendance Record' },
  { id: '2.3.1d', label: 'Targeted Surveillance Log updated daily (OP 519), separate log kept for employees on LCM computer' },
  { id: '6.3', label: 'Employee Signature Sheet current (OP 583)' },
  { id: '2.1.22', label: 'Community Resource List maintained (OP 556)' },
  { id: '2.1.27', label: 'Patient Paperless Contact Cards (RHI 1080) available and provided to patients at the time of any equipment setup' },
  { id: '1.1.23a', label: 'Identified patient fall risk flagged in eIntake under attributes' },
  { id: '1.1.23b', label: 'Identified patient smoking risk flagged in eIntake under attributes' },
  { id: '2.4.1', label: 'Incidents documented and reported per policy (OP 518)' },
  { id: '2.1.29', label: 'Patient complaints are documented (OP 564)' },
  { id: '2.1.29a', label: 'Patient complaints are responded to within 5 days' },
  { id: '2.1.29b', label: 'Patient complaints responded to in writing within 14 days (OP 566)' },
];

export const FACILITY_REVIEW_SECTIONS = {
  overallFacility: { title: 'Overall Facility', items: OVERALL_FACILITY_ITEMS },
  warehouseSpecific: { title: 'Warehouse Specific', items: WAREHOUSE_SPECIFIC_ITEMS },
  documentation: { title: 'Documentation', items: DOCUMENTATION_ITEMS },
};

export const WAREHOUSE_OVERALL_FACILITY_ITEMS = [
  { id: '1.1.14', label: 'Joint Commission contact sign posted in public view (JC 434)' },
  { id: '1.1.4', label: 'All licenses, certificates, and permits to operate posted in area accessible patients' },
  { id: '1.1.12', label: 'Hours of operation are posted' },
  { id: '2.3.1', label: 'Posted front door assistance sign for equipment returns (OP 554)' },
  { id: '2.2.1', label: 'No Pets Allowed sign posted on/near entrance to facility (OP 555)' },
  { id: 'covid_signage', label: 'COVID-19 signage posted as required by protocol', noPolicy: true },
  { id: 'restroom_accessibility', label: 'Are restrooms handicap accessible? If not, post "No Public Restrooms" signage in lobby', noPolicy: true },
  { id: '2.4.2', label: '"No Firearms" signs hanging on/near front entrance to facility. (Must have an English and Spanish version.) (Some states have French)' },
  { id: '1.1.23', label: 'Patient Safety Goals Poster visible in location (JC 428)' },
  { id: '1.1.4a', label: 'Field Management Organization Chart posted (OP 201)' },
  { id: '2.2.4', label: 'Safety Culture Poster hung in employee area (RM 1246)' },
  { id: '2.4.14', label: 'Workplace Violence Prevention Plan (OP 524) posted in each employee work area' },
  { id: '2.4.13', label: 'Evacuation plan posted (includes smoke alarms, fire extinguishers & designated assembly point)' },
  { id: '2.4.13a', label: 'Smoke alarms present and checks documented (per manufacturer recommendation, weekly) on FDA 001 OR Annual Inspection of suppression system' },
  { id: '2.4.13b', label: 'Fire extinguisher present and monthly checks documented (hang tag)' },
  { id: '2.4.13c', label: 'Record of annual fire extinguisher recharge' },
  { id: '2.2.1a', label: 'Exits identified and accessible (no obstructions and able to exit without a key). If emergency lighting present, monthly checks documented on FDA 001' },
  { id: '6.4.2', label: 'Compliant with all HIPAA regulations' },
  { id: '2.2.1b', label: 'Facility is clean and organized' },
  { id: '2.3.1a', label: 'Hand gel readily available for employees and patients in all areas of the location' },
  { id: '2.4.2a', label: 'Expired Mada Products removed (2 years from Manufacturer Date) hand gel, wipes, spray', helpModal: 'mada' },
  { id: '2.3.1b', label: 'Hand washing guidelines posted in all restrooms (OP 503)' },
  { id: '2.3.1c', label: 'Antimicrobial soap in restroom (non-refillable)' },
  { id: '2.2.1c', label: 'PPE and first aid kits (without expired products) available in location' },
];

export const WAREHOUSE_DOCUMENTATION_ITEMS = [
  { id: '2.1.53', label: 'Following all state requirements as per CL 302 State Clinical Requirements' },
  { id: '2.2.1e', label: 'Record of Facility Safety Inspection (OP 512) twice in last 12 months (recommend January & July) & annual fire drill documented' },
  { id: '2.4.13d', label: 'Emergency Action/Fire Prevention Plan completed (RM 1240)' },
  { id: '2.2.3', label: 'SDS book available (data sheets alphabetized) to include: RM 1232 Hazardous Chemical Inventory List, RM 1234 Hazard Communication Program Training for each employee, RM 1238 PPE Hazard Assessment for each employee' },
  { id: '2.1.22', label: 'Community Resource List (OP 556)' },
  { id: '2.1.27', label: 'Patient Paperless Contact Cards (RHI 1080) available and provided to patients at the time of any equipment setup' },
];

export const WAREHOUSE_REVIEW_SECTIONS = {
  overallFacility: { title: 'Overall Facility', items: WAREHOUSE_OVERALL_FACILITY_ITEMS },
  warehouseSpecific: { title: 'Warehouse Specific', items: WAREHOUSE_SPECIFIC_ITEMS },
  documentation: { title: 'Documentation', items: WAREHOUSE_DOCUMENTATION_ITEMS },
};

export const VEHICLE_DOCUMENTATION_ITEMS = [
  { id: '2.2.1', label: 'Record of post daily vehicle inspection (OP 533)' },
  { id: '2.2.1a', label: 'Current vehicle registration & insurance' },
  { id: '2.2.1b', label: 'Accident report kit (RM 1202)' },
  { id: '2.6.7', label: 'Shipping papers (OP 534) matching number of tanks/vessels in door or on drivers seat' },
  { id: '1.1.23', label: 'Printed copies or RHI 1001 Home Medical Equipment Booklet' },
  { id: '1.1.12', label: 'Printed copies of RHI 1000 Patient Information Booklet' },
  { id: '1.1.23a', label: 'Printed copies of PE 662 High-Risk Smoking Education Packet' },
  { id: '2.1.15', label: 'Printed copies of OP 504 Against Medical Advice (AMA)' },
];

export const VEHICLE_EMERGENCY_EQUIPMENT_ITEMS = [
  { id: '2.2.1c', label: 'Reflective triangles' },
  { id: '2.2.1d', label: 'Working flashlight' },
  { id: '2.2.1e', label: 'Fire extinguisher, secured in cab, with monthly checks documented' },
  { id: '2.2.1f', label: 'Record of annual fire extinguisher recharge' },
  { id: '2.2.1g', label: 'PPE kit present, to include N95 mask and face-shield or goggles' },
  { id: '2.2.1h', label: 'First aid kit without expired products' },
  { id: '2.2.1i', label: 'Eye wash (16 oz. bottle) check for expiration and temperature parameters' },
  { id: '2.2.1j', label: 'SDS present on vehicle (only for chemicals on vehicle - Rotech Oxygen, eyewash, fire extinguisher, MadaGel, Mada FD, Mada Wipes and any other chemicals in vehicle)' },
  { id: '2.2.1k', label: '"No Smoking" sign in cab' },
  { id: '2.2.1l', label: '"No Smoking" sign in cargo' },
];

export const VEHICLE_STORAGE_ITEMS = [
  { id: '2.2.1m', label: 'Vehicle is clean and organized' },
  { id: '2.2.1n', label: 'Ratchet straps - NO BUNGEE CORDS' },
  { id: '2.2.1o', label: 'Circuit tester, Flow pen, Analyzer' },
  { id: '2.2.1p', label: 'Disinfectant present (Madacide wipes)' },
  { id: '2.2.5g', label: 'Red tags and non-clear bags present in vehicle' },
  { id: '2.2.5h', label: 'All equipment is properly bagged and tagged' },
  { id: '2.2.1q', label: 'Equipment and hand truck secured during transport' },
  { id: '2.7.9', label: 'Vehicle is locked when unattended' },
  { id: '2.1.28', label: 'All tanks secured' },
  { id: '2.2.1r', label: 'Signage for full/empty oxygen cylinders posted (OP 546)' },
];

export const VEHICLE_PLACARD_ITEMS = [
  { id: '2.6', label: 'Foley book complete for daily inspection' },
  { id: '2.6a', label: 'Current medical card' },
  { id: '2.6b', label: 'CDL license' },
  { id: '2.6c', label: 'Hazardous materials registration' },
  { id: '2.5.22', label: 'PPE kit for Transfill Drivers (goggles, face shield, apron, leather gloves or equivalent, steel toe shoes)' },
  { id: '2.6d', label: 'Record of annual certification of LOX scale' },
  { id: '2.6e', label: 'Record of annual DOT Inspection' },
];

export const VEHICLE_SECTIONS = {
  documentation: { title: 'Documentation', items: VEHICLE_DOCUMENTATION_ITEMS },
  emergencyEquipment: { title: 'Emergency Equipment', items: VEHICLE_EMERGENCY_EQUIPMENT_ITEMS },
  storage: { title: 'Storage', items: VEHICLE_STORAGE_ITEMS },
  placardVehicles: { title: 'Placard Vehicles', items: VEHICLE_PLACARD_ITEMS },
};

export const JC427_SECTIONS = {
  onboarding: {
    title: 'Onboarding Documents',
    items: [
      { id: 'welcome_email', label: 'Welcome to Rotech (Okay to Hire) Email' },
      { id: 'job_description', label: 'Job Description' },
      { id: 'general_orientation', label: 'General Orientation (HR 548)' },
      { id: 'professional_licensure', label: 'Professional Licensure' },
      { id: 'drivers_license', label: "Driver's License" },
      { id: 'policy_acknowledgment', label: 'Policy Acknowledgment / Computer Password Confidentiality' },
    ]
  },
  training: {
    title: 'Training Records',
    items: [
      { id: 'mandatory_annual', label: 'Mandatory Annual In-Services (SE 800)' },
      { id: 'storage_distribution', label: 'Storage and Distribution Training (FDA 019)' },
      { id: 'manufacturing_facility', label: 'Manufacturing Facility Orientation (FDA 021)' },
      { id: 'hazard_communication', label: 'Hazard Communication Program Training (RM 1234 with RM 1238)' },
    ]
  },
  performance: {
    title: 'Performance Review',
    items: [
      { id: 'employee_review', label: 'Employee Performance Review' },
    ]
  },
  medical: {
    title: 'Medical Records',
    items: [
      { id: 'hepatitis_b', label: 'Hepatitis B Test or OP 515 Vaccination Statement' },
      { id: 'tb_test', label: 'TB Test/Risk Assessment (per state requirements)' },
      { id: 'n95_fit_test', label: 'Annual N95 Mask Fit Testing (for "at risk" employees)' },
      { id: 'respirator_clearance', label: 'Medical Clearance for Respirator Use from 3M' },
    ]
  }
};

export const NON_CLINICAL_COMPETENCIES = [
  { id: 'aspirator', label: 'Aspirator / Suction (SE 816)' },
  { id: 'cpm', label: 'Continuous Passive Motion - CPM (SE 904)' },
  { id: 'pap_device', label: 'PAP Device (SE 811)' },
  { id: 'pap_mask', label: 'PAP Mask Fitting (SE 851)' },
  { id: 'high_pressure_cylinder', label: 'High Pressure Cylinder (SE 805)' },
  { id: 'hospital_bed', label: 'Hospital Bed & Trapeze (SE 807)' },
  { id: 'liquid_oxygen', label: 'Liquid Oxygen (SE 809)' },
  { id: 'lymphedema_pump', label: 'Lymphedema Pump (SE 856)' },
  { id: 'nebulizer_nc', label: 'Nebulizer (SE 812)' },
  { id: 'negative_pressure_wound', label: 'Negative Pressure Wound Care System (SE 903)' },
  { id: 'oxygen_analyzer', label: 'Oxygen Analyzer (SE 801)' },
  { id: 'oxygen_concentrator', label: 'Oxygen Concentrator (SE 803)' },
  { id: 'oxygen_concentrator_maintenance', label: 'Oxygen Concentrator Maintenance', note: 'Requires certificate only' },
  { id: 'oxygen_conserving_device_nc', label: 'Oxygen Conserving Device (SE 814)' },
  { id: 'patient_lift', label: 'Patient Lift (SE 818)' },
  { id: 'field_poc_repair', label: 'Field POC Repair & Maintenance Competency', note: 'Requires certificate only' },
  { id: 'power_wheelchair', label: 'Power Wheelchair (SE 862)' },
  { id: 'scooter', label: 'Scooter (SE 863)' },
  { id: 'warehouse_equipment_cleaning', label: 'Warehouse Equipment Cleaning (SE 855)' },
  { id: 'wheelchair_nc', label: 'Wheelchair (SE 824)' },
];

export const CLINICAL_COMPETENCIES = [
  { id: 'afflovest', label: 'AffloVest' },
  { id: 'airvo2', label: 'Airvo 2' },
  { id: 'astral_ventilator', label: 'Astral Ventilator' },
  { id: 'attention_to_detail', label: 'Attention to Detail' },
  { id: 'breas_vivo', label: 'Breas VIVO 45LS/50 Ventilator' },
  { id: 'cough_assist', label: 'Cough Assist (BiWaze)' },
  { id: 'cpap_bipap', label: 'CPAP & BIPAP' },
  { id: 'infant_monitor', label: 'Infant Monitor' },
  { id: 'invasive_ventilator', label: 'Invasive Ventilator' },
  { id: 'ltv_ventilator', label: 'LTV Ventilator' },
  { id: 'luisa_ventilator', label: 'Luisa Ventilator' },
  { id: 'mpv', label: 'Mouthpiece Ventilation (MPV)' },
  { id: 'nebulizer_c', label: 'Nebulizer' },
  { id: 'oxygen_c', label: 'Oxygen' },
  { id: 'oxygen_conserving_device_c', label: 'Oxygen Conserving Device' },
  { id: 'pediatric_ventilator', label: 'Pediatric Ventilator Management' },
  { id: 'pulse_oximetry', label: 'Pulse Oximetry' },
  { id: 'respiratory_assist_device', label: 'Respiratory Assist Device' },
  { id: 'trilogy_evo', label: 'Trilogy EVO Ventilator' },
  { id: 'vocsn_ventilator', label: 'VOCSN Ventilator (based on location)' },
  { id: 'virtual_ventilator_visit', label: 'Virtual Ventilator Visit' },
  { id: 'vivo2_bipap_st', label: 'VIVO2 - BiPAP ST' },
  { id: 'other1', label: 'Other', editableLabel: true },
  { id: 'other2', label: 'Other', editableLabel: true },
];

export const JOB_TITLES = [
  'AE',
  'CDL',
  'CSR',
  'CSR SUP',
  'CST',
  'DM',
  'LIAISON',
  'LCM',
  'LOC SUP',
  'LSM',
  'PAP SPECIALIST',
  'PST',
  'RN',
  'RT',
  'WHSE SUP',
];

export const ROLE_TYPE_LABELS = {
  clinical: 'Clinical',
  nonClinical: 'Non-Clinical',
};

export const JOB_TITLE_OTHER = 'Other';

export function getExpirationStatus(dateStr) {
  if (!dateStr) return null;
  const entered = new Date(`${dateStr}T00:00:00`);
  if (isNaN(entered.getTime())) return null;

  const expiration = new Date(entered);
  expiration.setFullYear(expiration.getFullYear() + 3);

  const warningStart = new Date(expiration);
  warningStart.setMonth(warningStart.getMonth() - 6);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (today > expiration) return 'red';
  if (today >= warningStart) return 'yellow';
  return 'green';
}

export function resolveJobTitle(employee) {
  if (!employee) return '';
  return employee.jobTitle === JOB_TITLE_OTHER
    ? (employee.jobTitleOther || '').trim()
    : (employee.jobTitle || '');
}
