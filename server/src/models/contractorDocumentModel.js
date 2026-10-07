'use strict';

const { pool } = require('../config/db');

function toDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    contractorId: row.contractor_id,
    name: row.name,
    documentName: row.name,
    documentType: row.document_type,
    filePath: row.file_path,
    fileName: row.file_name,
    fileSize: row.file_size,
    fileType: row.file_type,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // snake_case aliases
    contractor_id: row.contractor_id,
    document_type: row.document_type,
    file_path: row.file_path,
    file_name: row.file_name,
    file_size: row.file_size,
    file_type: row.file_type,
  };
}

async function findByContractorId(contractorId) {
  const [rows] = await pool.query(
    `SELECT cd.id, cd.contractor_id, cd.name, cd.document_type,
            cd.file_path, cd.file_name, cd.file_size, cd.file_type,
            cd.uploaded_by, cd.created_at, cd.updated_at,
            u.full_name AS uploaded_by_name
     FROM contractor_documents cd
     LEFT JOIN users u ON u.id = cd.uploaded_by
     WHERE cd.contractor_id = ?
     ORDER BY cd.created_at DESC`,
    [contractorId]
  );
  return rows.map(toDocument);
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT cd.*, u.full_name AS uploaded_by_name
     FROM contractor_documents cd
     LEFT JOIN users u ON u.id = cd.uploaded_by
     WHERE cd.id = ? LIMIT 1`,
    [id]
  );
  return toDocument(rows[0]);
}

async function create(data) {
  const contractorId = data.contractor_id ?? data.contractorId;
  const name = data.name ?? data.documentName ?? data.document_name;
  const documentType = data.document_type ?? data.documentType ?? 'other';
  const filePath = data.file_path ?? data.filePath;
  const fileName = data.file_name ?? data.fileName ?? name;
  const fileSize = data.file_size ?? data.fileSize ?? 0;
  const fileType = data.file_type ?? data.fileType ?? data.mimeType ?? null;
  const uploadedBy = data.uploaded_by ?? data.uploadedBy ?? null;

  const [result] = await pool.query(
    `INSERT INTO contractor_documents
     (contractor_id, name, document_type, file_path, file_name, file_size, file_type, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [contractorId, name, documentType, filePath, fileName, fileSize, fileType, uploadedBy]
  );
  return findById(result.insertId);
}

async function remove(id) {
  const [result] = await pool.query('DELETE FROM contractor_documents WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

module.exports = {
  findByContractorId,
  findById,
  create,
  remove,
};
