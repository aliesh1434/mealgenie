async function register() {
  const name = document.getElementById("name").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const res = await fetch("http://localhost:5000/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password })
  });

  const data = await res.json();
  const result = document.getElementById("result");
  result.innerText = data.message;

  if (data.message && data.message.toLowerCase().includes("success")) {
    setTimeout(() => {
      window.location.href = "login.html";
    }, 800);
  }
}
