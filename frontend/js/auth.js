// frontend/js/auth.js
document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = document.getElementById("err");
  err.style.display = "none";
  err.textContent = "";

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  try {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data?.error || "Giriş başarısız.");
    }
    // başarılı → ana sayfaya
    window.location.href = "/index.html";
  } catch (e) {
    err.textContent = e.message;
    err.style.display = "block";
  }
});
