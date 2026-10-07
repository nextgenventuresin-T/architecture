-- Architecture ERP — Company & System Theme Settings
USE `architecture_erp`;

CREATE TABLE IF NOT EXISTS `company_theme_settings` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `company_id` INT UNSIGNED NULL UNIQUE,
  `theme_id` VARCHAR(50) NOT NULL DEFAULT 'purple',
  `theme_name` VARCHAR(100) NOT NULL DEFAULT 'Purple',
  `is_custom` BOOLEAN NOT NULL DEFAULT FALSE,
  `colors` JSON NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_theme_client` FOREIGN KEY (`company_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default Global Theme (company_id = NULL)
INSERT INTO `company_theme_settings` (`id`, `company_id`, `theme_id`, `theme_name`, `is_custom`, `colors`)
VALUES (
  1,
  NULL,
  'purple',
  'Purple (Default)',
  FALSE,
  JSON_OBJECT(
    'primary', '#6B3FD4',
    'secondary', '#8B5CF6',
    'accent', '#F59E0B',
    'sidebarBg', '#4A2992',
    'sidebarText', '#FFFFFF',
    'background', '#F7F5FC',
    'card', '#FFFFFF',
    'buttonPrimaryBg', '#6B3FD4',
    'buttonPrimaryText', '#FFFFFF',
    'textMain', '#1C1731',
    'textMuted', '#3A3552',
    'border', '#E6E2F2',
    'statusSuccess', '#059669',
    'statusWarning', '#D97706',
    'statusDanger', '#B32424',
    'statusInfo', '#2563EB'
  )
)
ON DUPLICATE KEY UPDATE `theme_id` = VALUES(`theme_id`);
