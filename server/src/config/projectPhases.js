'use strict';

const PROJECT_PHASES_DEF = [
  {
    phase_number: 1,
    title: 'Site Preparation & Foundation',
    subcategories: [
      'Site clearing',
      'Excavation',
      'Earthwork',
      'Foundation',
      'Footings',
    ],
  },
  {
    phase_number: 2,
    title: 'Structural Construction',
    subcategories: [
      'Columns',
      'Beams',
      'Slabs',
      'Staircases',
      'Structural walls',
    ],
  },
  {
    phase_number: 3,
    title: 'Masonry & External Walls',
    subcategories: [
      'Brick/block work',
      'Internal partitions',
      'External walls',
      'Plastering',
    ],
  },
  {
    phase_number: 4,
    title: 'MEP Services',
    subcategories: [
      'Electrical',
      'Plumbing',
      'HVAC',
      'Fire fighting',
      'Low-voltage/data systems',
    ],
  },
  {
    phase_number: 5,
    title: 'Finishing Works',
    subcategories: [
      'Flooring',
      'False ceiling',
      'Painting',
      'Doors & windows',
      'Waterproofing',
      'Fixtures',
    ],
  },
  {
    phase_number: 6,
    title: 'External & Site Development',
    subcategories: [
      'Roads/paving',
      'Landscaping',
      'Drainage',
      'Boundary walls',
      'Parking',
    ],
  },
  {
    phase_number: 7,
    title: 'Testing, Inspection & Quality Control',
    subcategories: [
      'Structural inspection',
      'Electrical testing',
      'Plumbing testing',
      'Fire-safety testing',
      'Quality checks',
    ],
  },
  {
    phase_number: 8,
    title: 'Handover & Completion',
    subcategories: [
      'Final inspection',
      'Snag/defect rectification',
      'Completion documentation',
      'As-built drawings',
      'Client handover',
    ],
  },
];

module.exports = { PROJECT_PHASES_DEF };
