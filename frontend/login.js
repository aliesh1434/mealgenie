async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const res = await fetch("http://localhost:5000/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  const data = await res.json();
  const result = document.getElementById("result");

  if (data.token) {
    localStorage.setItem("token", data.token);
    localStorage.setItem("name", data.name || email.split("@")[0]);
    localStorage.setItem("email", data.email);

    result.style.color = "green";
    result.innerText = "Login Success!";
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 800);
  } else {
    result.style.color = "red";
    result.innerText = data.message || "Login failed";
  }
}
