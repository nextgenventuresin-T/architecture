'use strict';

const asyncHandler = require('../utils/asyncHandler');
const toolService = require('../services/toolService');
const toolUnitService = require('../services/toolUnitService');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

const list = asyncHandler(async (req, res) => ok(res, await toolService.list(req.query)));
const detail = asyncHandler(async (req, res) => {
  const tool = await toolService.getById(req.params.id);
  // Other contractors' assignments are not a contractor's business.
  if (req.user.role === 'contractor') tool.currentHolders = [];
  return ok(res, { tool, availability: await toolUnitService.availabilityForTool(req.params.id) });
});
const availability = asyncHandler(async (req, res) =>
  ok(res, await toolService.checkAvailability(req.params.id, req.query.quantity))
);
const allocate = asyncHandler(async (req, res) =>
  ok(res, await toolService.allocate({ ...req.body, tool_id: req.params.id }, req.user, req.hrScope))
);
const returnAllocation = asyncHandler(async (req, res) =>
  ok(res, { allocation: await toolService.returnTool(req.params.assignmentId, req.body, req.user, req.hrScope) })
);

// ---- serial-numbered units
const listUnits = asyncHandler(async (req, res) => ok(res, await toolUnitService.listUnits(req.query, req.hrScope)));
const unitDetail = asyncHandler(async (req, res) => ok(res, await toolUnitService.getUnit(req.params.unitId, req.hrScope)));
const registerUnit = asyncHandler(async (req, res) => ok(res, await toolUnitService.registerUnit(req.body, req.user), 201));
const updateUnit = asyncHandler(async (req, res) => ok(res, await toolUnitService.updateUnit(req.params.unitId, req.body, req.user)));
const updateHealth = asyncHandler(async (req, res) =>
  ok(res, await toolUnitService.updateHealth(req.params.unitId, req.body, req.user, req.hrScope))
);
const setAvailability = asyncHandler(async (req, res) =>
  ok(res, await toolUnitService.setAvailability(req.params.unitId, req.body, req.user))
);
const allocateUnit = asyncHandler(async (req, res) =>
  ok(res, { allocation: await toolUnitService.allocate({ ...req.body, unit_id: req.params.unitId }, req.user) }, 201)
);
const transferUnit = asyncHandler(async (req, res) =>
  ok(res, { allocation: await toolUnitService.transferUnit(req.params.unitId, req.body, req.user) })
);
const returnRental = asyncHandler(async (req, res) =>
  ok(res, await toolUnitService.returnRental(req.params.unitId, req.body, req.user))
);
const listAllocations = asyncHandler(async (req, res) => ok(res, await toolUnitService.listAllocations(req.query, req.hrScope)));
const setCharge = asyncHandler(async (req, res) =>
  ok(res, { allocation: await toolUnitService.setCharge(req.params.allocationId, req.body, req.user) })
);
const listRentals = asyncHandler(async (req, res) => ok(res, await toolUnitService.listRentals(req.query)));
const create = asyncHandler(async (req, res) => ok(res, { tool: await toolService.create(req.body) }, 201));
const update = asyncHandler(async (req, res) => ok(res, { tool: await toolService.update(req.params.id, req.body) }));
const remove = asyncHandler(async (req, res) => ok(res, await toolService.remove(req.params.id)));

module.exports = {
  listUnits, unitDetail, registerUnit, updateUnit, updateHealth, setAvailability, allocateUnit, transferUnit,
  returnRental, listAllocations, setCharge, listRentals,
  list,
  detail,
  availability,
  allocate,
  returnAllocation,
  create,
  update,
  remove,
};
