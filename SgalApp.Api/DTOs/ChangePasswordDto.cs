namespace SgalApp.Api.DTOs
{
    public class ChangePasswordDto
    {
        public int IdUsuario { get; set; }
        public string PassActual { get; set; } = "";
        public string PassNueva { get; set; } = null!;
        public bool EsAdmin { get; set; }
    }
}
