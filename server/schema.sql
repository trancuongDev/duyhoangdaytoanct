-- Tạo database
CREATE DATABASE IF NOT EXISTS duyhoangtoan CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE duyhoangtoan;

-- Bảng users (giáo viên + trợ lý + học sinh)
CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  username   VARCHAR(100) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,
  full_name  VARCHAR(150) NOT NULL,
  role       ENUM('teacher','assistant','student') NOT NULL DEFAULT 'student',
  class_name VARCHAR(50),
  active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bảng tài liệu (đề thi)
CREATE TABLE IF NOT EXISTS exams (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  title      VARCHAR(255) NOT NULL,
  class_name VARCHAR(50),
  date       DATE,
  file_name  VARCHAR(255),
  file_type  VARCHAR(100),
  file_path  VARCHAR(500),
  uploaded_by INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Bảng video
CREATE TABLE IF NOT EXISTS videos (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  title      VARCHAR(255) NOT NULL,
  class_name VARCHAR(50),
  date       DATE,
  file_name  VARCHAR(255),
  file_path  VARCHAR(500),
  uploaded_by INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Bảng nhật ký cảnh báo
CREATE TABLE IF NOT EXISTS alerts (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  student_id  INT,
  username    VARCHAR(100),
  student_name VARCHAR(150),
  class_name  VARCHAR(50),
  reason      VARCHAR(255),
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Tài khoản giáo viên mặc định (mật khẩu: admin123)
INSERT IGNORE INTO users (username, password, full_name, role)
VALUES ('duyhoangtoan', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhuO', 'Thầy Duy Hoàng', 'teacher');

-- Tài khoản trợ lý mặc định (mật khẩu: tro123)
INSERT IGNORE INTO users (username, password, full_name, role)
VALUES ('trolytoan', '$2a$10$8K1p/a0dR1xqM4B3mUgDuOWljALnquyBmMrNqKuMqMqMqMqMqMqMq', 'Trợ Lý', 'assistant');
