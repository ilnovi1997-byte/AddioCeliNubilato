document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById("name");
  const pinInput = document.getElementById("pin");
  const errorMsg = document.getElementById("errorMsg");
  const submitBtn = document.getElementById("submitBtn");

  errorMsg.textContent = "";
  submitBtn.disabled = true;
  submitBtn.textContent = "Accesso in corso...";

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nameInput.value,
        pin: pinInput.value,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      errorMsg.textContent = data.error || "Errore durante l'accesso.";
      submitBtn.disabled = false;
      submitBtn.textContent = "Entra nel Gruppo 🚀";
      return;
    }

    localStorage.setItem("party_user", JSON.stringify(data.user));
    window.location.href = "/app.html";
  } catch (err) {
    errorMsg.textContent = "Errore di connessione con il server.";
    submitBtn.disabled = false;
    submitBtn.textContent = "Entra nel Gruppo 🚀";
  }
});
