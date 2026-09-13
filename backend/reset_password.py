import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

# Chargement des variables d'environnement
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

async def reset_password():
    print("Connexion à MongoDB...")
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')
    
    if not mongo_url or not db_name:
        print("Erreur : MONGO_URL ou DB_NAME introuvable dans les variables d'environnement.")
        return
        
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("Suppression du mot de passe admin actuel de la base de données...")
    result = await db.admin_config.delete_one({"key": "admin_password"})
    
    if result.deleted_count > 0:
        print("✅ Le mot de passe a été supprimé de la base de données avec succès.")
    else:
        print("⚠️ Aucun mot de passe personnalisé n'a été trouvé dans la base de données.")
        
    default_pw = os.environ.get("ADMIN_PASSWORD", "wague-admin-2026")
    print(f"\nVous pouvez maintenant vous connecter avec le mot de passe par défaut : {default_pw}")
    print("Une fois connecté(e), vous pourrez le changer depuis l'interface d'administration.")

if __name__ == "__main__":
    asyncio.run(reset_password())
