let loggedUser = null;

const adminCheckbox = document.getElementById("adminCheckbox");
const adminField = document.getElementById("adminField");

if (adminCheckbox && adminField) {
  adminCheckbox.addEventListener("change", () => {
    adminField.style.display = adminCheckbox.checked ? "block" : "none";
  });
}

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("name").value.trim();
  const pin = document.getElementById("pin").value.trim();
  const adminCode = adminCheckbox.checked
    ? document.getElementById("adminCode").value.trim()
    : null;
  const errorMsg = document.getElementById("errorMsg");
  const submitBtn = document.getElementById("submitBtn");

  errorMsg.textContent = "";
  submitBtn.disabled = true;
  submitBtn.textContent = "Verifica in corso...";

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, pin, adminCode }),
    });
    const data = await res.json();

    if (!res.ok) {
      errorMsg.textContent = data.error || "Errore di accesso.";
      submitBtn.disabled = false;
      submitBtn.textContent = "Accedi 🚀";
      return;
    }

    loggedUser = data.user;
    localStorage.setItem("party_user", JSON.stringify(loggedUser));

    if (!loggedUser.team) {
      document.getElementById("loginCard").style.display = "none";
      document.getElementById("teamCard").style.display = "block";
    } else {
      window.location.href = "/app.html";
    }
  } catch (err) {
    errorMsg.textContent = "Errore di rete o server offline.";
    submitBtn.disabled = false;
    submitBtn.textContent = "Accedi 🚀";
  }
});

async function chooseTeam(teamName) {
  if (!loggedUser) return;

  try {
    const res = await fetch("/api/select-team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: loggedUser.id, team: teamName }),
    });
    const data = await res.json();

    if (res.ok) {
      localStorage.setItem("party_user", JSON.stringify(data.user));
      window.location.href = "/app.html";
    } else {
      alert(data.error || "Errore selezione squadra.");
    }
  } catch (e) {
    alert("Errore di connessione.");
  }
}
