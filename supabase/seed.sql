-- Seed Data for LabLoop
-- Note: Replace mock user IDs with real auth.users IDs in development

-- Mock profile inserts (in case local testing without full Supabase auth)
-- Realistic campus resources
INSERT INTO public.resources (
    id,
    owner_id,
    name,
    category,
    description,
    location,
    credit_rate,
    status,
    requires_credential,
    specifications
) VALUES
(
    '00000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'Ultimaker S5 Industrial 3D Printer',
    'equipment',
    'Dual-extrusion composite-ready 3D printer for rapid prototyping and precision manufacturing.',
    'Makerspace, Building 4, Room 102',
    10,
    'available',
    '3d_printer_certification',
    '{"build_volume": "330 x 240 x 300 mm", "layer_resolution": "20 micron", "materials": ["PLA", "ABS", "Nylon", "Carbon Fiber"]}'::jsonb
),
(
    '00000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'Class 1000 Precision Cleanroom & Lithography Station',
    'laboratory',
    'ISO Class 6 cleanroom facility equipped with mask aligner, spin coater, and laminar flow hoods.',
    'Nanotechnology Center, Wing B, Room 210',
    50,
    'available',
    'cleanroom_access',
    '{"cleanliness_class": "ISO 6 / Class 1000", "gown_required": true, "max_occupancy": 6}'::jsonb
),
(
    '00000000-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    'Olympus BX53 Fluorescence Microscope',
    'equipment',
    'High-resolution upright fluorescence microscope with digital camera for biological sample imaging.',
    'Life Sciences Hall, Lab 3B',
    25,
    'available',
    'biomaterial_handling',
    '{"magnification": "40x-1000x", "filter_cubes": ["DAPI", "FITC", "TRITC"], "camera": "20MP CMOS"}'::jsonb
),
(
    '00000000-0000-0000-0000-000000000004',
    '11111111-1111-1111-1111-111111111111',
    'Collaborative VR Simulation & Robotics Arena',
    'space',
    'Open trackable floor space with ceiling-mounted OptiTrack motion capture and tethered VR rigs.',
    'Computer Science Complex, Innovation Bay 12',
    15,
    'available',
    NULL,
    '{"tracking_volume": "8m x 6m x 3m", "sensors": "OptiTrack Prime 13", "headsets": ["Meta Quest Pro", "HTC Vive Pro 2"]}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
