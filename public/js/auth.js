const adminCheckbox = document.getElementById("adminCheckbox");
const adminField = document.getElementById("adminField");

// Mostra o nasconde il campo del codice admin quando si spunta la casella
if (adminCheckbox && adminField) {
  adminCheckbox.addEventListener("change", () => {
    adminField.style.display = adminCheckbox.checked ? "block" : "none";
  });
}

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const nameInput = document.getElementById("name");
  const pinInput = document.getElementById("pin");
  const adminCodeInput = document.getElementById("adminCode");
  const errorMsg = document.getElementById("errorMsg");
  const submitBtn = document.getElementById("submitBtn");

  errorMsg.textContent = "";
  submitBtn.disabled = true;
  submitBtn.textContent = "Accesso in corso...";

  const payload = {
    name: nameInput.value.trim(),
    pin: pinInput.value.trim(),
    adminCode:
      adminCheckbox && adminCheckbox.checked && adminCodeInput
        ? adminCodeInput.value.trim()
        : null,
  };

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      errorMsg.textContent = data.error || "Errore durante l'accesso.";
      submitBtn.disabled = false;
      submitBtn.textContent = "Entra nel Gruppo 🚀";
      return;
    }

    // Salva l'oggetto utente nel localStorage del browser
    localStorage.setItem("party_user", JSON.stringify(data.user));

    // Reindirizza alla dashboard principale
    window.location.href = "/app.html";
  } catch (err) {
    errorMsg.textContent = "Errore di connessione con il server.";
    submitBtn.disabled = false;
    submitBtn.textContent = "Entra nel Gruppo 🚀";
  }
});
