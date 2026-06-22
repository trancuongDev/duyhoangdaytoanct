# Hướng dẫn cài đặt Backend

## 1. Cài Node.js
Tải tại: https://nodejs.org (chọn bản LTS)

## 2. Cài MySQL
Tải tại: https://dev.mysql.com/downloads/installer/
Hoặc dùng XAMPP: https://www.apachefriends.org

## 3. Tạo database
Mở MySQL Workbench hoặc phpMyAdmin, chạy file:
```
server/schema.sql
```

## 4. Cấu hình kết nối
```
cd server
copy .env.example .env
```
Mở file `.env`, điền mật khẩu MySQL của bạn vào `DB_PASS`.

## 5. Cài thư viện
```
cd server
npm install
```

## 6. Chạy server
```
npm start
```

## 7. Mở trình duyệt
Truy cập: http://localhost:3000/login.html

---

## Tài khoản mặc định
| Vai trò   | Tên đăng nhập | Mật khẩu |
|-----------|---------------|----------|
| Giáo viên | duyhoangtoan  | admin123 |
| Trợ lý    | trolytoan     | tro123   |
