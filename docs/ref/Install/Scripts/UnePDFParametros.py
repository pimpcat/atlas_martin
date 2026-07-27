# -*- coding: utf-8 -*-
import arcpy, os, time, sys, shutil
try:
    rutaSalida = "D:\GEPROCEN\PDFS\COND-CROQ\CROQUIS-MUNICIPAL\Aguascalientes\Aguascalientes"
    Nom = "Aguascalientes.pdf"
    rutaTemp = "D:\GEPROCEN\PDFS\COND-CROQ\CROQUIS-MUNICIPAL\Aguascalientes\Aguascalientes\PAR"
      
    if len(sys.argv) >= 1:    
        rutaSalida = sys.argv [1]
        Nom = sys.argv [2]
        rutaTemp = sys.argv [3]

    print "1 " , rutaSalida
    print "2 " , Nom
    print "3 " , rutaTemp
	
    # ------------------- LE QUITO LOS GUIONES PARA QUE SE VEA MAS BONITO ---------------------------
    rutaSalida = rutaSalida.replace("*", " ")
    #Nom = Nom.replace("_", " ")
    rutaTemp = rutaTemp.replace("*", " ")

    print "1 " , rutaSalida
    print "2 " , Nom
    print "3 " , rutaTemp

    the_path = os.path.abspath (rutaTemp)
    the_path = os.path.join(the_path, "temp")           
    the_path2 = os.path.abspath (rutaSalida)
    rutaPDF = os.path.join(the_path2, Nom)

    print "ARCHIVOS TEMPORALES " , the_path
    print "SALIDA " , rutaPDF
    print "SALIDA " , rutaSalida

    #nombre = input ("Escriba su nombre: ")
    #print "Me alegro de conocerle ", nombre

    if os.path.exists(rutaPDF):
        os.remove(rutaPDF)
        
    if os.path.exists(the_path):
        #Create the file and append pages
        pdfDoc = arcpy.mapping.PDFDocumentCreate(rutaPDF)
        listD = os.listdir(the_path)
        for items in listD:
            print "dato" , items
            pdfDoc.appendPages(os.path.join(the_path, items))
        pdfDoc.saveAndClose()
    else:               
        print "NO EXISTE QUE QUIERES QUE HAGA"
    shutil.rmtree(the_path)         #Borra Carpeta Temporal
except IOError as e:
    print "I/O error({0}): {1}".format(e.errno, e.strerror)
except ValueError:
    print "Could not convert data to an integer."
except:
    print "Unexpected error:", sys.exc_info()[0]
    raise

sys.exit(0)

