'use strict';

const importService = require('../services/importService');
const asyncHandler = require('../utils/asyncHandler');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

const fields = asyncHandler(async (req, res) => ok(res, importService.describe(req.params.entity)));

const run = asyncHandler(async (req, res) => {
  const { rows, onDuplicate, dryRun, firstRowNumber } = req.body;
  const result = await importService.run(
    req.params.entity,
    rows,
    { onDuplicate, dryRun: Boolean(dryRun), firstRowNumber: Number(firstRowNumber) || 2 },
    req.user
  );
  ok(res, result);
});

module.exports = { fields, run };
